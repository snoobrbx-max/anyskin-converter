export function generateAnySkinCommand(textureUrl: string): string {
  if (!/^https?:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(textureUrl)) {
    throw new Error("Invalid Minecraft texture URL");
  }
  return `/skin ${textureUrl}`;
}
