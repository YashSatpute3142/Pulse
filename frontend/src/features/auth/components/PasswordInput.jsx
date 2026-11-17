import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../../components/ui/Input.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';

// Show/hide button: 44 hit area, aria-pressed.
export function PasswordInput({ autoComplete, ...rest }) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...rest}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      endAdornment={(
        <IconButton label={shown ? 'Hide password' : 'Show password'} pressed={shown} tooltip={false} size={36} onClick={() => setShown((s) => !s)} className="hit-44">
          {shown ? <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.5} aria-hidden="true" />}
        </IconButton>
      )}
    />
  );
}
