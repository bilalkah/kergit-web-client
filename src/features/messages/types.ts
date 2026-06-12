export enum ChatMessageRenderMode {
  RichAuto = 'rich_auto',
  Plain = 'plain',
}

export enum ChatMessageImageBehavior {
  InlinePreviewWithLink = 'inline_preview_with_link',
  LinkOnly = 'link_only',
}

export interface ChatMessageRenderConfig {
  renderMode: ChatMessageRenderMode
  imageBehavior: ChatMessageImageBehavior
}

export enum ChatComposerActionKind {
  Attach = 'attach',
  Send = 'send',
}

export enum ChatLinkPreviewCardVariant {
  Message = 'message',
  Composer = 'composer',
}

export enum ChatAttachmentKind {
  Unspecified = 0,
  Image = 1,
  File = 2,
}

export interface ChatMessageAttachment {
  id: string
  kind: ChatAttachmentKind
  storageKey: string
  mimeType: string
  displayName: string
  sizeBytes: number
  signedUrl?: string
}

export interface ChatMessageAttachmentSignedUrlResolveOptions {
  forceRefresh?: boolean
}

export type ChatMessageAttachmentSignedUrlResolver = (
  attachment: ChatMessageAttachment,
  options?: ChatMessageAttachmentSignedUrlResolveOptions,
) => Promise<string>

export interface ChatMessageLinkPreview {
  url: string
  title: string
  description: string
  siteName: string
  imageUrl: string
}

export interface ChatComposerAttachmentDraft {
  id: string
  kind: ChatAttachmentKind
  file: File
  mimeType: string
  displayName: string
  sizeBytes: number
  previewUrl: string
  uploadStatus: ChatComposerAttachmentUploadStatus
  uploadErrorMessage: string
  uploadedAttachment: ChatMessageAttachment | null
}

export enum ChatComposerAttachmentUploadStatus {
  Draft = 'draft',
  Uploading = 'uploading',
  Uploaded = 'uploaded',
  Failed = 'failed',
}

export interface ChatMessageBubbleModel {
  id: string
  content: string
  own: boolean
  createdAtMs: number
  attachments?: ChatMessageAttachment[]
  linkPreview?: ChatMessageLinkPreview | null
}
