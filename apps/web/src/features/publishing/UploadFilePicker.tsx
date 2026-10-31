import {
  uploadZoneStyles,
  hasFileStyles,
  overStyles,
  fileInputStyles,
  selectedUploadFileStyles,
  uploadIconStyles,
} from './styles.js';
import { textBtnStyles, iconBtnStyles, btnStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { FileArchive, FileJson, Trash2, UploadCloud } from '../../shared/icons/lucide.js';
import { useRef, useState } from 'react';
import { bytesLabel } from '../../shared/format/labels.js';

export function UploadFilePicker({
  kind,
  file,
  reading,
  onChoose,
  onClear,
}: {
  kind: string;
  file: File | null;
  reading: boolean;
  onChoose: (files: FileList | null) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const Icon = kind === 'skill' ? FileArchive : FileJson;
  return (
    <div
      className={cn(uploadZoneStyles, file ? hasFileStyles : '', over ? overStyles : '')}
      aria-busy={reading || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onChoose(event.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        className={fileInputStyles}
        tabIndex={-1}
        type="file"
        aria-label="选择上传文件"
        accept={kind === 'skill' ? '.zip' : '.json'}
        onChange={(event) => {
          onChoose(event.target.files);
          event.target.value = '';
        }}
      />
      {file ? (
        <>
          <Icon size={28} aria-hidden="true" />
          <div className={selectedUploadFileStyles}>
            <strong>{file.name}</strong>
            <span>
              {bytesLabel(file.size)} · {reading ? '正在读取…' : '待上传校验'}
            </span>
          </div>
          <button className={textBtnStyles} type="button" onClick={() => input.current?.click()}>
            更换
          </button>
          <button className={iconBtnStyles} type="button" aria-label="移除文件" onClick={onClear}>
            <Trash2 size={16} />
          </button>
        </>
      ) : (
        <>
          <span className={uploadIconStyles}>
            <UploadCloud size={26} />
          </span>
          <strong>{kind === 'skill' ? '拖入 Skill ZIP 包' : '拖入 MCP 描述文件'}</strong>
          <span>
            {kind === 'skill'
              ? '选择后自动识别名称和版本 · 最大 20 MiB'
              : '读取 JSON 中的名称和版本 · 最大 20 MiB'}
          </span>
          <button className={btnStyles} type="button" onClick={() => input.current?.click()}>
            选择{kind === 'skill' ? ' ZIP 文件' : ' JSON 文件'}
          </button>
        </>
      )}
    </div>
  );
}
