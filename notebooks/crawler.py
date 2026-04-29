#!/usr/bin/env python3
"""Telegram crawler.

Outputs per dataset under <output_path>/<seed>/:
- graph.json
- nodes.csv
- edges.csv
- message_nodes.csv
- message_edges.csv
- broken_groups.csv
- broken_group_links.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import pathlib
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Iterable, List, Optional, Set, Tuple

from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    FloodWaitError,
    InviteHashExpiredError,
    InviteHashInvalidError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
)
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetFullChatRequest
from telethon.tl.types import (
    Channel,
    Chat,
    Message,
    MessageEntityMention,
    MessageEntityMentionName,
    MessageEntityTextUrl,
)


@dataclass
class CrawlConfig:
    api_id: str
    api_hash: str
    session_name: str
    phone: str
    start_seeds: List[str]
    max_depth: int
    max_per_chat: Optional[int]
    handle_delay: float
    max_wait: int
    max_subs_for_messages: int
    output_path: str
    incremental: bool
    known_message_streak_stop: int


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_handle(value: str) -> str:
    return (value or "").strip().lstrip("@").lower()


def strip_wrapping_quotes(value: str) -> str:
    s = (value or "").strip()
    if len(s) >= 2 and (
        (s.startswith('"') and s.endswith('"'))
        or (s.startswith("'") and s.endswith("'"))
    ):
        return s[1:-1].strip()
    return s


def normalize_seed(seed: str) -> str:
    return normalize_handle(seed)


def load_env_from_file(path: pathlib.Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        if key and value and key not in os.environ:
            os.environ[key] = value


def maybe_load_dotenv() -> None:
    candidates = [
        pathlib.Path.cwd() / ".env",
        pathlib.Path.cwd().parent / ".env",
        pathlib.Path(__file__).resolve().parent.parent / ".env",
    ]
    for candidate in candidates:
        load_env_from_file(candidate)


def is_likely_username(value: str) -> bool:
    s = normalize_handle(value)
    if len(s) < 5 or len(s) > 32:
        return False
    if not re.fullmatch(r"[a-z][\w\d]{3,30}[a-z\d]", s):
        return False
    return True


def handle_from_url(url: str) -> str:
    match = re.search(r"(?:https?://)?t\.me/(?:c/\d+/)?([A-Za-z0-9_]+)", url or "")
    return normalize_handle(match.group(1)) if match else ""


def parse_tme_message_link(url: str) -> Tuple[str, str]:
    match = re.search(r"(?:https?://)?t\.me/([A-Za-z0-9_]+)/([0-9]+)", url or "")
    if not match:
        return "", ""
    return normalize_handle(match.group(1)), match.group(2)


def collect_reactions(message: Message) -> Tuple[int, Dict[str, int]]:
    counts: Dict[str, int] = {}
    if message.reactions and getattr(message.reactions, "results", None):
        for reaction in message.reactions.results:
            emoji = getattr(reaction.reaction, "emoticon", str(reaction.reaction))
            counts[emoji] = counts.get(emoji, 0) + reaction.count
    return sum(counts.values()), counts


def extract_mentions_and_links(
    message: Message,
) -> Tuple[Set[str], List[Tuple[str, str, str]]]:
    chats: Set[str] = set()
    links: List[Tuple[str, str, str]] = []
    if not message:
        return chats, links

    if message.entities:
        text = message.message or ""
        for entity in message.entities:
            if isinstance(entity, MessageEntityMention):
                handle = normalize_handle(text[entity.offset : entity.offset + entity.length])
                if is_likely_username(handle):
                    chats.add(handle)
            elif isinstance(entity, MessageEntityMentionName):
                continue
            elif isinstance(entity, MessageEntityTextUrl):
                handle = handle_from_url(entity.url)
                if is_likely_username(handle):
                    chats.add(handle)
                msg_handle, msg_id = parse_tme_message_link(entity.url)
                if is_likely_username(msg_handle) and msg_id:
                    links.append((msg_handle, msg_id, "link"))

    if message.forward and message.forward.chat:
        username = normalize_handle(getattr(message.forward.chat, "username", None) or "")
        if username and is_likely_username(username):
            chats.add(username)
            fwd_msg_id = (
                getattr(message.forward, "channel_post", None)
                or getattr(message.forward, "saved_from_msg_id", None)
                or getattr(message.forward, "msg_id", None)
            )
            if fwd_msg_id:
                links.append((username, str(fwd_msg_id), "forward"))

    if message.message:
        for match in re.findall(
            r"(?:https?://)?t\.me/(?:c/\d+/)?([A-Za-z0-9_]+)", message.message
        ):
            handle = normalize_handle(match)
            if is_likely_username(handle):
                chats.add(handle)

        for match in re.findall(r"(?:https?://)?t\.me/([A-Za-z0-9_]+)/([0-9]+)", message.message):
            handle = normalize_handle(match[0])
            if is_likely_username(handle):
                chats.add(handle)
                links.append((handle, match[1], "link"))

    return chats, links


def get_title(entity: Any, handle: str) -> str:
    return getattr(entity, "title", None) or getattr(entity, "first_name", "") or handle


async def get_subscriber_count(client: TelegramClient, entity: Any) -> int:
    try:
        if isinstance(entity, Channel):
            full = await client(GetFullChannelRequest(entity))
            return int(getattr(full.full_chat, "participants_count", 0) or 0)
        if isinstance(entity, Chat):
            full = await client(GetFullChatRequest(entity.id))
            return int(getattr(full.full_chat, "participants_count", 0) or 0)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] subscribers for {getattr(entity, 'username', entity)} failed: {exc}")
    return 0


def classify_entity_error(exc: Exception) -> Tuple[str, str]:
    if isinstance(exc, UsernameNotOccupiedError):
        return "not_found", "username not occupied"
    if isinstance(exc, UsernameInvalidError):
        return "invalid_username", "username invalid"
    if isinstance(exc, ChannelPrivateError):
        return "private_or_deleted", "channel is private or deleted"
    if isinstance(exc, InviteHashExpiredError):
        return "invite_expired", "invite hash expired"
    if isinstance(exc, InviteHashInvalidError):
        return "invite_invalid", "invite hash invalid"

    raw = str(exc).strip()
    lower = raw.lower()
    if "no user has" in lower or "nobody is using this username" in lower:
        return "not_found", raw
    if "private" in lower and "deleted" in lower:
        return "private_or_deleted", raw
    if "username" in lower and "invalid" in lower:
        return "invalid_username", raw
    return "resolve_failed", raw


async def fetch_entity_with_backoff(
    client: TelegramClient, handle: str, max_wait: int
) -> Tuple[Optional[Any], Optional[str], Optional[str]]:
    handle = normalize_handle(handle)
    if not is_likely_username(handle):
        return None, "invalid_format", "failed local username validation"

    while True:
        try:
            return await client.get_entity(handle), None, None
        except FloodWaitError as exc:
            wait = int(getattr(exc, "seconds", 0) or 0)
            if max_wait and wait > max_wait:
                return (
                    None,
                    "flood_wait_exceeded",
                    f"flood wait {wait}s exceeds maxWait={max_wait}s",
                )
            print(f"[wait] {handle}: flood wait {wait}s on get_entity; sleeping...")
            await asyncio.sleep(wait + 1)
        except Exception as exc:  # noqa: BLE001
            status, reason = classify_entity_error(exc)
            return None, status, reason


def load_existing_graph(output_dir: pathlib.Path) -> Dict[str, Any]:
    graph_path = output_dir / "graph.json"
    if not graph_path.exists():
        return {}
    try:
        return json.loads(graph_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] failed to read existing graph from {graph_path}: {exc}")
        return {}


def index_existing_messages(messages: Iterable[Dict[str, Any]]) -> Dict[str, Set[str]]:
    by_chat: Dict[str, Set[str]] = defaultdict(set)
    for msg in messages:
        chat = normalize_handle(str(msg.get("chat") or ""))
        msg_id = str(msg.get("message_id") or "").strip()
        if chat and msg_id:
            by_chat[chat].add(msg_id)
    return by_chat


def dedupe_key_edge(row: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        normalize_handle(str(row.get("from") or "")),
        normalize_handle(str(row.get("to") or "")),
        str(row.get("message_id") or "").strip(),
    )


def dedupe_key_message_edge(row: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        str(row.get("from") or "").strip().lower(),
        str(row.get("to") or "").strip().lower(),
        str(row.get("type") or "").strip().lower(),
    )


def dedupe_key_broken_link(row: Dict[str, Any]) -> Tuple[str, str, str, str]:
    return (
        normalize_handle(str(row.get("from") or "")),
        normalize_handle(str(row.get("to") or "")),
        str(row.get("status") or "").strip(),
        str(row.get("reason") or "").strip(),
    )


def merge_existing_broken_groups(
    existing_rows: Iterable[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for row in existing_rows:
        handle = normalize_handle(str(row.get("id") or ""))
        if not handle:
            continue
        item = merged.get(handle)
        if not item:
            source_groups = row.get("source_groups") or []
            sample_messages = row.get("sample_messages") or []
            if isinstance(source_groups, str):
                source_groups = [s for s in source_groups.split("|") if s]
            if isinstance(sample_messages, str):
                sample_messages = [s for s in sample_messages.split("|") if s]
            item = {
                "id": handle,
                "status": str(row.get("status") or "resolve_failed"),
                "reason": str(row.get("reason") or ""),
                "total_mentions": int(row.get("total_mentions") or 0),
                "source_groups": set(normalize_handle(s) for s in source_groups if s),
                "sample_messages": set(s for s in sample_messages if s),
                "first_seen": str(row.get("first_seen") or ""),
                "last_seen": str(row.get("last_seen") or ""),
                "last_checked": str(row.get("last_checked") or ""),
            }
            merged[handle] = item
            continue

        item["status"] = str(row.get("status") or item["status"])
        item["reason"] = str(row.get("reason") or item["reason"])
        item["total_mentions"] = int(item["total_mentions"] or 0) + int(
            row.get("total_mentions") or 0
        )

    return merged


async def crawl_graph(
    client: TelegramClient,
    seeds: Iterable[str],
    max_depth: int,
    max_per_chat: Optional[int],
    handle_delay: float,
    max_wait: int,
    max_subs_for_messages: int,
    existing_graph: Optional[Dict[str, Any]] = None,
    incremental: bool = True,
    known_message_streak_stop: int = 30,
) -> Dict[str, Any]:
    existing_graph = existing_graph or {}

    existing_nodes = existing_graph.get("nodes", []) if incremental else []
    existing_edges = existing_graph.get("edges", []) if incremental else []
    existing_messages = existing_graph.get("messages", []) if incremental else []
    existing_message_edges = (
        existing_graph.get("message_edges", []) if incremental else []
    )
    existing_broken_groups = (
        existing_graph.get("broken_groups", []) if incremental else []
    )
    existing_broken_group_links = (
        existing_graph.get("broken_group_links", []) if incremental else []
    )

    visited: Set[str] = set()
    queue: Deque[Tuple[str, int]] = deque()

    seed_list = [normalize_handle(seed) for seed in seeds if normalize_handle(seed)]
    for seed in seed_list:
        queue.append((seed, 0))

    if incremental:
        for node in existing_nodes:
            node_id = normalize_handle(str(node.get("id") or ""))
            if node_id and node_id not in seed_list:
                queue.append((node_id, max_depth))

    nodes: Dict[str, Dict[str, Any]] = {}
    for row in existing_nodes:
        node_id = normalize_handle(str(row.get("id") or ""))
        if not node_id:
            continue
        nodes[node_id] = {
            "id": node_id,
            "title": row.get("title") or node_id,
            "subscribers": int(row.get("subscribers") or 0),
        }

    edges: List[Dict[str, Any]] = []
    edge_keys: Set[Tuple[str, str, str]] = set()
    for row in existing_edges:
        key = dedupe_key_edge(row)
        if not key[0] or not key[1]:
            continue
        if key in edge_keys:
            continue
        edge_keys.add(key)
        edges.append({"from": key[0], "to": key[1], "message_id": key[2]})

    messages: List[Dict[str, Any]] = []
    message_ids_by_chat = index_existing_messages(existing_messages)
    message_keys: Set[str] = set()
    for row in existing_messages:
        msg_id = str(row.get("id") or "").strip().lower()
        chat = normalize_handle(str(row.get("chat") or ""))
        message_id = str(row.get("message_id") or "").strip()
        if not msg_id or not chat or not message_id:
            continue
        if msg_id in message_keys:
            continue
        message_keys.add(msg_id)
        row_copy = dict(row)
        row_copy["id"] = msg_id
        row_copy["chat"] = chat
        row_copy["message_id"] = message_id
        messages.append(row_copy)

    message_edges: List[Dict[str, Any]] = []
    message_edge_keys: Set[Tuple[str, str, str]] = set()
    for row in existing_message_edges:
        key = dedupe_key_message_edge(row)
        if not key[0] or not key[1]:
            continue
        if key in message_edge_keys:
            continue
        message_edge_keys.add(key)
        message_edges.append({"from": key[0], "to": key[1], "type": key[2] or "link"})

    broken_groups = merge_existing_broken_groups(existing_broken_groups)

    broken_link_counts: Dict[Tuple[str, str, str, str], int] = defaultdict(int)
    for row in existing_broken_group_links:
        key = dedupe_key_broken_link(row)
        if not key[0] or not key[1]:
            continue
        broken_link_counts[key] += int(row.get("count") or 0) or 1

    mention_counts_by_target: Dict[str, int] = defaultdict(int)
    mention_sources_by_target: Dict[str, Set[str]] = defaultdict(set)
    mention_samples_by_target: Dict[str, Set[str]] = defaultdict(set)
    mention_pair_counts_by_target: Dict[str, Dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )

    def record_broken_handle(target: str, status: str, reason: str) -> None:
        target = normalize_handle(target)
        if not target:
            return

        entry = broken_groups.get(target)
        if not entry:
            entry = {
                "id": target,
                "status": status,
                "reason": reason,
                "total_mentions": 0,
                "source_groups": set(),
                "sample_messages": set(),
                "first_seen": now_iso(),
                "last_seen": "",
                "last_checked": now_iso(),
            }
            broken_groups[target] = entry

        entry["status"] = status or entry.get("status") or "resolve_failed"
        entry["reason"] = reason or entry.get("reason") or ""
        entry["last_checked"] = now_iso()

        count = mention_counts_by_target.get(target, 0)
        if count > 0:
            entry["total_mentions"] = int(entry.get("total_mentions") or 0) + count
            entry["source_groups"].update(mention_sources_by_target.get(target, set()))
            entry["sample_messages"].update(mention_samples_by_target.get(target, set()))
            entry["last_seen"] = now_iso()

            pair_counts = mention_pair_counts_by_target.get(target, {})
            for source, source_count in pair_counts.items():
                key = (normalize_handle(source), target, entry["status"], entry["reason"])
                broken_link_counts[key] += int(source_count or 0)

            mention_counts_by_target.pop(target, None)
            mention_sources_by_target.pop(target, None)
            mention_samples_by_target.pop(target, None)
            mention_pair_counts_by_target.pop(target, None)

    def clear_broken_handle(target: str) -> None:
        target = normalize_handle(target)
        if target in broken_groups:
            broken_groups.pop(target, None)
        stale_keys = [key for key in broken_link_counts.keys() if key[1] == target]
        for key in stale_keys:
            broken_link_counts.pop(key, None)

    while queue:
        handle_raw, depth = queue.popleft()
        handle = normalize_handle(handle_raw)
        if not handle:
            continue
        if handle in visited or depth > max_depth:
            continue

        if handle_delay > 0:
            await asyncio.sleep(handle_delay)

        entity, failure_status, failure_reason = await fetch_entity_with_backoff(
            client, handle, max_wait
        )
        if not entity:
            visited.add(handle)
            status = failure_status or "resolve_failed"
            reason = failure_reason or "failed to resolve entity"
            record_broken_handle(handle, status, reason)
            print(f"[skip] {handle}: {status} ({reason})")
            continue

        clear_broken_handle(handle)

        title = get_title(entity, handle)
        subscribers = await get_subscriber_count(client, entity)
        if subscribers < 200:
            print(
                f"[skip-subs] {handle}: {subscribers} subscribers < 200, skipping node and children"
            )
            visited.add(handle)
            continue

        nodes[handle] = {
            "id": handle,
            "title": title,
            "subscribers": subscribers,
        }
        visited.add(handle)
        print(f"[scrape] {handle} depth={depth}")

        if max_subs_for_messages and subscribers > max_subs_for_messages:
            print(
                f"[skip-msgs] {handle}: {subscribers} subscribers > {max_subs_for_messages}, skipping messages"
            )
            continue

        retries = 0
        max_retries_per_chat = 3
        known_ids_for_chat = message_ids_by_chat.get(handle, set()) if incremental else set()
        seen_known_streak = 0
        new_count = 0

        while True:
            try:
                async for message in client.iter_messages(entity, limit=max_per_chat):
                    msg_id = str(message.id)
                    msg_key = f"{handle}:{msg_id}".lower()

                    if incremental and msg_id in known_ids_for_chat:
                        seen_known_streak += 1
                        if (
                            known_message_streak_stop > 0
                            and seen_known_streak >= known_message_streak_stop
                        ):
                            print(
                                f"[incremental-stop] {handle}: hit {seen_known_streak} known messages in a row"
                            )
                            break
                        continue

                    seen_known_streak = 0
                    if msg_key in message_keys:
                        continue

                    reaction_count, reaction_details = collect_reactions(message)
                    messages.append(
                        {
                            "id": msg_key,
                            "chat": handle,
                            "message_id": msg_id,
                            "date": message.date.isoformat() if message.date else "",
                            "text": message.message or "",
                            "views": int(message.views or 0),
                            "sender_id": message.sender_id,
                            "reaction_count": reaction_count,
                            "reaction_breakdown": reaction_details,
                            "url": f"https://t.me/{handle}/{message.id}",
                        }
                    )
                    message_keys.add(msg_key)
                    known_ids_for_chat.add(msg_id)
                    message_ids_by_chat[handle] = known_ids_for_chat
                    new_count += 1

                    chat_mentions, msg_links = extract_mentions_and_links(message)
                    for target in chat_mentions:
                        target_handle = normalize_handle(target)
                        if not is_likely_username(target_handle):
                            continue

                        edge_key = (handle, target_handle, msg_id)
                        if edge_key not in edge_keys:
                            edge_keys.add(edge_key)
                            edges.append(
                                {
                                    "from": handle,
                                    "to": target_handle,
                                    "message_id": msg_id,
                                }
                            )

                        mention_counts_by_target[target_handle] += 1
                        mention_sources_by_target[target_handle].add(handle)
                        if len(mention_samples_by_target[target_handle]) < 12:
                            mention_samples_by_target[target_handle].add(msg_key)
                        mention_pair_counts_by_target[target_handle][handle] += 1

                        if target_handle not in visited and depth < max_depth:
                            queue.append((target_handle, depth + 1))

                    for target_chat, target_msg_id, reason in msg_links:
                        target_key = f"{normalize_handle(target_chat)}:{target_msg_id}".lower()
                        m_key = (msg_key, target_key, reason.lower())
                        if m_key not in message_edge_keys:
                            message_edge_keys.add(m_key)
                            message_edges.append(
                                {
                                    "from": msg_key,
                                    "to": target_key,
                                    "type": reason.lower(),
                                }
                            )

                    if getattr(message, "reply_to_msg_id", None):
                        reply_key = f"{handle}:{message.reply_to_msg_id}".lower()
                        m_key = (msg_key, reply_key, "reply")
                        if m_key not in message_edge_keys:
                            message_edge_keys.add(m_key)
                            message_edges.append(
                                {
                                    "from": msg_key,
                                    "to": reply_key,
                                    "type": "reply",
                                }
                            )
                break
            except FloodWaitError as exc:
                wait = int(getattr(exc, "seconds", 0) or 0)
                retries += 1
                if (max_wait and wait > max_wait) or retries >= max_retries_per_chat:
                    print(
                        f"[skip] {handle}: flood wait {wait}s on iter_messages, retries={retries}; skipping chat"
                    )
                    break
                print(
                    f"[wait] {handle}: flood wait {wait}s on iter_messages; sleeping and resuming..."
                )
                await asyncio.sleep(wait + 1)
                continue
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] iter_messages for {handle} failed: {exc}")
                break

        if incremental:
            print(f"[incremental] {handle}: +{new_count} new messages")

    broken_groups_out = []
    for handle, row in broken_groups.items():
        sources = sorted(set(normalize_handle(s) for s in row.get("source_groups", set()) if s))
        samples = sorted(set(row.get("sample_messages", set())))
        broken_groups_out.append(
            {
                "id": handle,
                "status": str(row.get("status") or "resolve_failed"),
                "reason": str(row.get("reason") or ""),
                "total_mentions": int(row.get("total_mentions") or 0),
                "source_group_count": len(sources),
                "source_groups": sources,
                "sample_messages": samples,
                "first_seen": str(row.get("first_seen") or ""),
                "last_seen": str(row.get("last_seen") or ""),
                "last_checked": str(row.get("last_checked") or ""),
            }
        )

    broken_links_out = []
    for (source, target, status, reason), count in broken_link_counts.items():
        if not source or not target:
            continue
        broken_links_out.append(
            {
                "from": source,
                "to": target,
                "count": int(count),
                "status": status,
                "reason": reason,
            }
        )

    broken_groups_out.sort(key=lambda x: (-int(x.get("total_mentions") or 0), x["id"]))
    broken_links_out.sort(key=lambda x: (-int(x.get("count") or 0), x["from"], x["to"]))

    return {
        "nodes": sorted(nodes.values(), key=lambda x: x["id"]),
        "edges": edges,
        "messages": messages,
        "message_edges": message_edges,
        "broken_groups": broken_groups_out,
        "broken_group_links": broken_links_out,
    }


def write_csv(path: pathlib.Path, rows: Iterable[Dict[str, Any]], fieldnames: List[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def write_graph_outputs(graph: Dict[str, Any], output_dir: pathlib.Path, seed: str = "") -> pathlib.Path:
    output_dir.mkdir(parents=True, exist_ok=True)

    graph_path = output_dir / "graph.json"
    graph_path.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")

    write_csv(output_dir / "nodes.csv", graph.get("nodes", []), ["id", "title", "subscribers"])
    write_csv(output_dir / "edges.csv", graph.get("edges", []), ["from", "to", "message_id"])

    message_rows = []
    base_message_fields = [
        "id",
        "chat",
        "message_id",
        "date",
        "url",
        "views",
        "reaction_count",
        "reaction_breakdown",
        "text",
        "sender_id",
    ]
    base_message_field_set = set(base_message_fields)
    extra_message_fields: List[str] = []
    seen_extra_message_fields: Set[str] = set()
    for msg in graph.get("messages", []):
        msg_copy = dict(msg)
        msg_copy["reaction_breakdown"] = json.dumps(
            msg_copy.get("reaction_breakdown", {}), ensure_ascii=False
        )
        for key in msg_copy.keys():
            if key in base_message_field_set:
                continue
            if key not in seen_extra_message_fields:
                seen_extra_message_fields.add(key)
                extra_message_fields.append(key)
        message_rows.append(msg_copy)

    write_csv(
        output_dir / "message_nodes.csv",
        message_rows,
        [*base_message_fields, *extra_message_fields],
    )
    write_csv(
        output_dir / "message_edges.csv",
        graph.get("message_edges", []),
        ["from", "to", "type"],
    )

    broken_groups_csv_rows = []
    for row in graph.get("broken_groups", []):
        broken_groups_csv_rows.append(
            {
                "id": row.get("id", ""),
                "status": row.get("status", ""),
                "reason": row.get("reason", ""),
                "total_mentions": row.get("total_mentions", 0),
                "source_group_count": row.get("source_group_count", 0),
                "source_groups": "|".join(row.get("source_groups", []) or []),
                "sample_messages": "|".join(row.get("sample_messages", []) or []),
                "first_seen": row.get("first_seen", ""),
                "last_seen": row.get("last_seen", ""),
                "last_checked": row.get("last_checked", ""),
            }
        )

    write_csv(
        output_dir / "broken_groups.csv",
        broken_groups_csv_rows,
        [
            "id",
            "status",
            "reason",
            "total_mentions",
            "source_group_count",
            "source_groups",
            "sample_messages",
            "first_seen",
            "last_seen",
            "last_checked",
        ],
    )

    write_csv(
        output_dir / "broken_group_links.csv",
        graph.get("broken_group_links", []),
        ["from", "to", "count", "status", "reason"],
    )

    broken_groups_count = len(graph.get("broken_groups", []))
    broken_mentions = sum(
        int(item.get("total_mentions") or 0) for item in graph.get("broken_groups", [])
    )
    summary = (
        f"{len(graph.get('nodes', []))} nodes, "
        f"{len(graph.get('messages', []))} messages, "
        f"{broken_groups_count} broken groups ({broken_mentions} mentions)"
    )
    print(f"[export] {seed or output_dir.name}: {summary} -> {output_dir}")
    return output_dir


async def run_crawl(config: CrawlConfig) -> Dict[str, Dict[str, Any]]:
    session_candidates: List[str] = []
    seen_candidates: Set[str] = set()

    def add_session_candidate(value: str) -> None:
        normalized = strip_wrapping_quotes(value)
        if not normalized or normalized in seen_candidates:
            return
        seen_candidates.add(normalized)
        session_candidates.append(normalized)

    add_session_candidate(config.session_name)
    if "/" not in config.session_name and "\\" not in config.session_name:
        candidate_path = pathlib.Path("notebooks") / f"{config.session_name}.session"
        if candidate_path.exists():
            add_session_candidate(str(pathlib.Path("notebooks") / config.session_name))
        legacy_session = pathlib.Path("notebooks/session.session")
        if legacy_session.exists():
            add_session_candidate("notebooks/session")

    selected_session = config.session_name
    client: Optional[TelegramClient] = None

    def make_client(session: str) -> TelegramClient:
        return TelegramClient(
            session,
            int(config.api_id),
            str(config.api_hash),
            flood_sleep_threshold=3600,
        )

    for session_name in session_candidates:
        probe = make_client(session_name)
        await probe.connect()
        try:
            if await probe.is_user_authorized():
                client = probe
                selected_session = session_name
                print(f"[auth] using existing authorized session: {session_name}.session")
                break
        finally:
            if client is not probe:
                await probe.disconnect()

    if client is None:
        selected_session = session_candidates[0] if session_candidates else config.session_name
        client = make_client(selected_session)
        print(
            "[auth] no authorized session found. "
            "Telethon will ask for your phone number (format like +491701234567)."
        )
        if config.phone:
            await client.start(phone=config.phone)
        else:
            await client.start()

    print(f"Client connected ({selected_session}.session)")

    graphs: Dict[str, Dict[str, Any]] = {}
    try:
        for seed in config.start_seeds:
            slug = normalize_seed(seed)
            output_dir = pathlib.Path(config.output_path) / slug
            existing_graph = load_existing_graph(output_dir) if config.incremental else {}

            graph = await crawl_graph(
                client,
                [seed],
                config.max_depth,
                config.max_per_chat,
                config.handle_delay,
                config.max_wait,
                config.max_subs_for_messages,
                existing_graph=existing_graph,
                incremental=config.incremental,
                known_message_streak_stop=config.known_message_streak_stop,
            )

            graphs[slug] = graph
            write_graph_outputs(graph, output_dir, slug)
    finally:
        if client:
            await client.disconnect()

    return graphs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Telegram crawler with incremental updates and broken-link tracking."
    )
    parser.add_argument(
        "--start-seed",
        default=os.getenv("TG_START_SEEDS", "generationidentitaire"),
        help="Comma-separated seed usernames.",
    )
    parser.add_argument(
        "--session-name",
        default=os.getenv("TG_SESSION_NAME", "session_name"),
        help="Telethon session basename/path (without .session).",
    )
    parser.add_argument(
        "--phone",
        default=os.getenv("TG_PHONE", ""),
        help="Optional login phone number in international format (e.g. +491701234567).",
    )
    parser.add_argument("--max-depth", type=int, default=int(os.getenv("TG_MAX_DEPTH", "2")))
    parser.add_argument("--max-per-chat", type=int, default=int(os.getenv("TG_MAX_PER_CHAT", "300")))
    parser.add_argument(
        "--handle-delay", type=float, default=float(os.getenv("TG_HANDLE_DELAY", "8.0"))
    )
    parser.add_argument("--max-wait", type=int, default=int(os.getenv("TG_MAX_WAIT", "3600")))
    parser.add_argument(
        "--max-subs-for-messages",
        type=int,
        default=int(os.getenv("TG_MAX_SUBS_FOR_MESSAGES", "30000")),
    )
    parser.add_argument(
        "--output-path",
        default=os.getenv("TG_OUTPUT_PATH", "data"),
        help="Directory where per-seed folders are written.",
    )
    parser.add_argument(
        "--incremental",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Reuse existing graph and skip old messages (default: enabled).",
    )
    parser.add_argument(
        "--known-message-streak-stop",
        type=int,
        default=int(os.getenv("TG_KNOWN_MESSAGE_STREAK_STOP", "40")),
        help="Stop scanning a chat after this many known messages in a row.",
    )
    return parser.parse_args()


def load_config(args: argparse.Namespace) -> CrawlConfig:
    maybe_load_dotenv()

    api_id = strip_wrapping_quotes(os.getenv("TG_API_ID", ""))
    api_hash = strip_wrapping_quotes(os.getenv("TG_API_HASH", ""))
    session_name = strip_wrapping_quotes(str(args.session_name))
    phone = strip_wrapping_quotes(str(args.phone))

    if not api_id or not api_hash:
        raise RuntimeError("Missing TG_API_ID/TG_API_HASH in environment or .env")

    raw_seeds = [
        normalize_handle(strip_wrapping_quotes(s))
        for s in str(args.start_seed).split(",")
        if normalize_handle(strip_wrapping_quotes(s))
    ]
    if not raw_seeds:
        raise RuntimeError("No start seed configured")

    max_per_chat = None if int(args.max_per_chat) <= 0 else int(args.max_per_chat)

    return CrawlConfig(
        api_id=api_id,
        api_hash=api_hash,
        session_name=session_name,
        phone=phone,
        start_seeds=raw_seeds,
        max_depth=int(args.max_depth),
        max_per_chat=max_per_chat,
        handle_delay=float(args.handle_delay),
        max_wait=int(args.max_wait),
        max_subs_for_messages=int(args.max_subs_for_messages),
        output_path=str(args.output_path),
        incremental=bool(args.incremental),
        known_message_streak_stop=int(args.known_message_streak_stop),
    )


def main() -> None:
    args = parse_args()
    config = load_config(args)

    print(
        "[config]",
        json.dumps(
            {
                "start_seeds": config.start_seeds,
                "max_depth": config.max_depth,
                "max_per_chat": config.max_per_chat,
                "handle_delay": config.handle_delay,
                "max_wait": config.max_wait,
                "max_subs_for_messages": config.max_subs_for_messages,
                "output_path": config.output_path,
                "session_name": config.session_name,
                "phone_configured": bool(config.phone),
                "incremental": config.incremental,
                "known_message_streak_stop": config.known_message_streak_stop,
            },
            ensure_ascii=False,
        ),
    )

    asyncio.run(run_crawl(config))


if __name__ == "__main__":
    main()
