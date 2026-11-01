import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { formStackStyles } from '../../shared/styles/recipes.js';
import { SkillApiKeyField } from '../../shared/components/SkillApiKeyField.js';

export function SkillUsageForm({
  assetId,
  revision,
  requiresApiKey,
  onSaved,
}: {
  assetId: string;
  revision: number;
  requiresApiKey: boolean;
  onSaved: () => void;
}) {
  const [required, setRequired] = useState(requiresApiKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mutate(
        '/api/assets/' + assetId + '/usage',
        { requires_api_key: required },
        'PATCH',
        revision,
      );
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={formStackStyles} onSubmit={submit} aria-label="Skill 使用要求">
      <h3>使用要求</h3>
      <SkillApiKeyField checked={required} onChange={setRequired} disabled={busy} />
      {error && <Message error>{error}</Message>}
      <Submit type="submit" busy={busy} disabled={required === requiresApiKey}>
        保存使用要求
      </Submit>
    </form>
  );
}
