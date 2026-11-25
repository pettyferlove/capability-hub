import type { EvaluationEvidence } from '@capability-hub/domain/models';
import type { z } from 'zod';

/** 单次评测调用的附加条件：出站授权、通过 Schema 后的业务规则，以及请求中其他版本的引用。 */
export interface EvaluationCallOptions<T> {
  authorize?: () => Promise<void>;
  accept?: (value: T) => void;
  resources?: readonly string[];
}

/** 各阶段只在实际出站时核对业务租约，以及该次调用所需的受众权限。 */
export type EvaluationCall = <S extends z.ZodType>(
  step: string,
  instructions: string,
  input: string,
  schema: S,
  options?: EvaluationCallOptions<z.infer<S>>,
) => Promise<z.infer<S>>;

/** 短调用把整个用户输入作为一个 JSON 字符串发送。 */
export function wireTextBytes(text: string) {
  return Buffer.byteLength(JSON.stringify(text)) - 2;
}

/** 用户输入本身也是 JSON 时，其中的字符串须先经过内层转义。 */
export function jsonFieldBytes(text: string) {
  return wireTextBytes(JSON.stringify(text).slice(1, -1));
}

/** 按 Unicode 代码点截断，保留下来的前缀可逐字交给评审。 */
export function fitText(text: string, budget: number, measure = wireTextBytes) {
  if (measure(text) <= budget) return text;
  const characters = [...text];
  let start = 0;
  let end = characters.length;
  while (start < end) {
    const mid = Math.ceil((start + end) / 2);
    if (measure(characters.slice(0, mid).join('')) <= budget) start = mid;
    else end = mid - 1;
  }
  return characters.slice(0, start).join('');
}

/** 装填材料和文件目录按完整行交给模型，超长行不提供半行依据。 */
export function fitLines(text: string, budget: number) {
  const sent = fitText(text, budget);
  return sent === text ? sent : sent.slice(0, sent.lastIndexOf('\n') + 1);
}

/** 并列候选或盲评两份交付物平分剩余空间，短文本让出的字节留给长文本。 */
export function fitJsonFields(values: string[], budget: number) {
  const order = values
    .map((value, index) => ({ index, size: jsonFieldBytes(value) }))
    .sort((a, b) => a.size - b.size);
  const sent = [...values];
  let slots = values.length;
  for (const { index } of order) {
    sent[index] = fitText(values[index], Math.floor(budget / slots), jsonFieldBytes);
    budget -= jsonFieldBytes(sent[index]);
    slots--;
  }
  return sent;
}

/** 每条引用必须完整落在同一文件的一段真实装填内容内。 */
export function sentEvidence(items: EvaluationEvidence[], ranges: EvaluationEvidence[]) {
  return items.filter(
    (item) =>
      item.end_line >= item.start_line &&
      ranges.some(
        (range) =>
          range.path === item.path &&
          range.start_line <= item.start_line &&
          range.end_line >= item.end_line,
      ),
  );
}
