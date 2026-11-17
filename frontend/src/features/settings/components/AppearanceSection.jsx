import { useTheme } from '../../../app/theme/useTheme.js';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { SettingRow } from './SettingRow.jsx';
import { useUpdateSettings } from '../hooks/useUpdateSettings.js';

const OPTIONS = [{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }];

export function AppearanceSection() {
  const { choice, setChoice } = useTheme();
  const toast = useToast();
  const update = useUpdateSettings();
  const onChange = (value) => {
    setChoice(value); // applies instantly and persists on this device
    update.mutate({ theme: value }, { onError: () => toast.error('Theme saved on this device only. Could not sync it to your account.') });
  };
  return (
    <section aria-labelledby="appearance-h" className="flex flex-col">
      <h2 id="appearance-h" className="font-mono text-xs uppercase tracking-wider text-ink-faint">Appearance</h2>
      <SettingRow label="Theme" helper="System follows your device.">
        <SegmentedControl label="Theme" options={OPTIONS} value={choice} onChange={onChange} />
      </SettingRow>
    </section>
  );
}
