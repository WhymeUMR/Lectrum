export declare const CreateIngestionRequestSchema: import("zod").ZodObject<Pick<{
    jobId: import("zod").ZodString;
    lectureId: import("zod").ZodString;
    sourceType: import("zod").ZodEnum<["upload", "url", "video_url"]>;
    sourceUrl: import("zod").ZodOptional<import("zod").ZodString>;
    filename: import("zod").ZodString;
    mimeType: import("zod").ZodOptional<import("zod").ZodString>;
    requestedLanguage: import("zod").ZodDefault<import("zod").ZodString>;
    uploadedAt: import("zod").ZodString;
    fileBase64: import("zod").ZodOptional<import("zod").ZodString>;
}, "sourceType" | "sourceUrl" | "filename" | "mimeType" | "requestedLanguage" | "fileBase64">, "strip", import("zod").ZodTypeAny, {
    sourceType: "url" | "upload" | "video_url";
    filename: string;
    requestedLanguage: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
    fileBase64?: string | undefined;
}, {
    sourceType: "url" | "upload" | "video_url";
    filename: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
    requestedLanguage?: string | undefined;
    fileBase64?: string | undefined;
}>;
