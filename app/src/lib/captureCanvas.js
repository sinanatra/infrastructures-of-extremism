const sanitizeFileName = (value) => {
  if (!value) return "canvas";
  const trimmed = value.toString().trim();
  if (!trimmed) return "canvas";
  return trimmed.replace(/[^\w.-]/g, "-");
};

const ensurePngExtension = (value) => {
  if (!value) return "canvas.png";
  const lower = value.toLowerCase();
  return lower.endsWith(".png") ? value : `${value}.png`;
};

export async function captureCanvasAsPng(canvas, fileName) {
  if (!canvas || typeof canvas.toBlob !== "function") return;
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blobResult) => {
        if (!blobResult) {
          reject(new Error("Failed to capture canvas"));
          return;
        }
        resolve(blobResult);
      },
      "image/png"
    );
  });

  const safeName = ensurePngExtension(sanitizeFileName(fileName));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  await new Promise((resolve) => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve();
    }, 0);
  });
}
