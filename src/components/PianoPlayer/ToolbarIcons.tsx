import type { SVGProps } from "react";

type ToolbarIconProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  size?: number;
};

function IconBase({ size = 16, children, ...props }: ToolbarIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function NoteIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <path d="M6 2.5V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 3.5L12 5V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="4.5" cy="12" rx="2.5" ry="1.9" fill="currentColor" />
      <ellipse cx="10.5" cy="11.8" rx="2.2" ry="1.7" fill="currentColor" />
    </IconBase>
  );
}

export function NotesIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <path d="M4.5 2.5V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 3V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 3.5L9 4.5L12 4.2V8.3L9 8.8L4.5 7.5V3.5Z" fill="currentColor" />
      <ellipse cx="3.4" cy="12" rx="2.1" ry="1.6" fill="currentColor" />
      <ellipse cx="8.2" cy="12" rx="2.1" ry="1.6" fill="currentColor" />
      <ellipse cx="12.1" cy="10.8" rx="1.8" ry="1.4" fill="currentColor" />
    </IconBase>
  );
}

export function RecordIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <circle cx="8" cy="8" r="5.2" fill="#cc0000" />
      <circle cx="8" cy="8" r="5.2" stroke="#7a0000" strokeWidth="1" />
    </IconBase>
  );
}

export function StopIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" fill="#7d7d7d" />
      <path d="M12.8 3.2V12.8H3.2" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.9" />
    </IconBase>
  );
}

function FloppyDiskGlyph() {
  return (
    <>
      <rect x="8.5" y="7.5" width="6.5" height="7.5" fill="currentColor" />
      <rect x="9.8" y="8.7" width="3.7" height="1.5" fill="#d4d0c8" />
      <rect x="11.2" y="12.1" width="2.1" height="2" fill="#d4d0c8" />
      <rect x="8.5" y="7.5" width="6.5" height="7.5" stroke="currentColor" strokeWidth="0.8" />
    </>
  );
}

function OpenFolderGlyph() {
  return (
    <>
      <path d="M8.1 10.5H15L13.8 14.5H7.2L8.1 10.5Z" fill="#d5d200" stroke="currentColor" strokeWidth="0.8" />
      <path d="M7.5 9H10.1L10.8 8.2H14.7V10.5H8.1L7.5 9Z" fill="#ece95d" stroke="currentColor" strokeWidth="0.8" />
    </>
  );
}

function SpeakerGlyph() {
  return (
    <>
      <path d="M1.5 9.6H4L6.8 12V4L4 6.4H1.5V9.6Z" fill="#d5d200" stroke="currentColor" strokeWidth="0.9" />
      <path d="M8.1 6C9 6.8 9.2 9.2 8.1 10" stroke="#7f7f7f" strokeWidth="1" strokeLinecap="round" />
      <path d="M9.7 4.8C11.2 6 11.4 10 9.7 11.2" stroke="#7f7f7f" strokeWidth="1" strokeLinecap="round" />
    </>
  );
}

export function NoteSaveIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <path d="M4 1.8V9.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 2.8L8 3.8V8.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="2.8" cy="11" rx="2.1" ry="1.6" fill="currentColor" />
      <ellipse cx="6.9" cy="9.8" rx="1.8" ry="1.4" fill="currentColor" />
      <FloppyDiskGlyph />
    </IconBase>
  );
}

export function NoteOpenIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <path d="M4 1.8V9.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 2.8L8 3.8V8.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="2.8" cy="11" rx="2.1" ry="1.6" fill="currentColor" />
      <ellipse cx="6.9" cy="9.8" rx="1.8" ry="1.4" fill="currentColor" />
      <OpenFolderGlyph />
    </IconBase>
  );
}

export function SoundSaveIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <SpeakerGlyph />
      <FloppyDiskGlyph />
    </IconBase>
  );
}

export function SoundOpenIcon({ size = 16, ...props }: ToolbarIconProps) {
  return (
    <IconBase size={size} {...props}>
      <SpeakerGlyph />
      <OpenFolderGlyph />
    </IconBase>
  );
}
