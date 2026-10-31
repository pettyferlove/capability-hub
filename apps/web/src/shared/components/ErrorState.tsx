import { errorStateStyles, errorStateMessageStyles, textBtnStyles } from '../styles/recipes.js';
import { RefreshCw } from '../icons/lucide.js';
import { Message } from './Message.js';

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Message error className={errorStateStyles}>
      <span className={errorStateMessageStyles}>{message}</span>
      {retry && (
        <button type="button" className={textBtnStyles} onClick={retry}>
          <RefreshCw size={14} />
          重新加载
        </button>
      )}
    </Message>
  );
}
