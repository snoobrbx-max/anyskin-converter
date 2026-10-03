import type { Result } from "@/lib/types";
import { CopyField } from "./CopyField";
export function ResultCard({ result }: { result: Result | null }) {
  return <section className={`card result-card ${result ? "has-result" : ""}`} aria-labelledby="result-title"><div className="card-heading"><h2 id="result-title">Your texture</h2><span className={`pill ${result ? "ready" : ""}`}>{result ? "READY" : "OUTPUT"}</span></div>{result ? <>
    <CopyField label="AnySkin Command" value={result.anyskin.command} primary /><p className="field-help">Copy and paste this command into Minecraft.</p>
    <CopyField label="Texture URL" value={result.skin.textureUrl} />
    <div className="model-result"><span>Model</span><strong>{result.skin.variant === "slim" ? "Slim / Alex" : "Classic / Steve"}</strong></div>
    <CopyField label="Texture Hash" value={result.skin.textureHash} />
    {result.skin.uuid && <CopyField label="MineSkin UUID" value={result.skin.uuid} />}
    <details><summary>Advanced details <span>Value & signature</span></summary><CopyField label="Texture Value" value={result.skin.value} /><CopyField label="Texture Signature" value={result.skin.signature} /></details>
  </> : <div className="empty-result"><div className="terminal-symbol" aria-hidden="true">&gt;_</div><h3>A new look starts here.</h3><p>Upload your skin, pick a model, and generate a texture. Your command will appear here.</p><div className="empty-command"><span>/skin</span> your-texture-url</div><div className="output-features"><span>✓ Minecraft texture URL</span><span>✓ Signed texture data</span><span>✓ Ready-to-copy command</span></div></div>}
  </section>;
}
