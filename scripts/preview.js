import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function previewServer(port = 4173) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(resolve(root) + sep) || pathname.split("/").some(part => part.startsWith("."))) {
        response.writeHead(403).end(); return;
      }
      const content = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] || "text/plain", "Cache-Control": "no-store" });
      response.end(content);
    } catch { if (!response.headersSent) response.writeHead(404); response.end("Not found"); }
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await previewServer();
  console.log("RDRARC preview: http://127.0.0.1:4173");
}
