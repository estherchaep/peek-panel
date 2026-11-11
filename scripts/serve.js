// Tiny static server for the demo: npm run demo → http://localhost:5173/demo/
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".mp4": "video/mp4" }
const port = Number(process.env.PORT) || 5173

createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "")
    const file = join(root, path.endsWith("/") ? path + "index.html" : path)
    try {
        const body = await readFile(file)
        res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" })
        res.end(body)
    } catch {
        res.writeHead(404).end("Not found")
    }
}).listen(port, () => console.log(`Demo: http://localhost:${port}/demo/`))
