import type { ContentFile } from '@capability-hub/domain/content';
import type { EvaluationDimensionResult } from '@capability-hub/domain/models';

/** 输入仅含固定版本文件，解析在隔离环境中执行，不读取扫描结论。 */
export type SkillStaticAnalyzer = (files: ContentFile[]) => Promise<EvaluationDimensionResult>;
