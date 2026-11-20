/** Чувствительное содержимое не попадает в детали ошибки. */
export type HubFeedbackSecretScanner = (text: string) => Iterable<{ line: number }>;
