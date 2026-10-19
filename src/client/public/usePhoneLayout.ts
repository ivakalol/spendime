import { useEffect, useState } from 'react';

export const phoneMedia = '(max-width: 700px)';

/** Match the public phone layout without rendering or downloading both previews. */
export function usePhoneLayout() {
  const [phone, setPhone] = useState(() => window.matchMedia?.(phoneMedia).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(phoneMedia);
    if (!media) return;
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}
