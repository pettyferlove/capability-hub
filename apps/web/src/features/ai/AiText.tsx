import { SafeMarkdown } from '../../shared/components/SafeMarkdown.js';
import { messageStyles } from './styles.js';

/**
 * 渲染 AI 输出的 Markdown（经 `{@link SafeMarkdown}` 消毒）。这里刻意不传可跳转路径、`onOpen` 为空实现，
 * 因此输出中的文件引用只作展示，不会触发导航。
 */
export function AiText({ text }: { text: string }) {
  return (
    <div className={messageStyles}>
      <SafeMarkdown text={text} currentFile="answer.md" paths={[]} onOpen={() => undefined} />
    </div>
  );
}
