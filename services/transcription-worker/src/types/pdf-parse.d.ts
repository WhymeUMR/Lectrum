declare module 'pdf-parse' {
  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<{ text: string }>;
}
