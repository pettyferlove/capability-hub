import { SafeMarkdown } from '../../shared/components/SafeMarkdown.js';
import { messageStyles } from './styles.js';

export function AiText({ text }: { text: string }) {
  return (
    <div className={messageStyles}>
      <SafeMarkdown text={text} currentFile="answer.md" paths={[]} onOpen={() => undefined} />
    </div>
  );
}
