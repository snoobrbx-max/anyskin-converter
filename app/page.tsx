import { SkinUploader } from "@/components/SkinUploader";
import Link from "next/link";
export default function Home() {
  return <div className="shell">
    <header className="topbar"><Link href="/" className="brand"><span className="brand-icon" aria-hidden="true">▦</span> ANYSKIN <span className="brand-light">/ TOOLS</span></Link><span className="edition">JAVA EDITION</span></header>
    <main><div className="intro"><p className="eyebrow">YOUR SKIN. READY TO EQUIP.</p><h1>AnySkin Converter<span>.</span></h1><p>Upload a Minecraft skin and generate an AnySkin-compatible texture.</p></div><SkinUploader /></main>
    <footer><span>Built for your next look.</span><span>Textures powered by <a href="https://mineskin.org" target="_blank" rel="noreferrer">MineSkin ↗</a></span></footer>
  </div>;
}
