import { useEffect, useState } from 'react';
import { claudeUse, isWeb, openFeedback } from './platform';
import { toast } from '../components/UI';

/**
 * Beta feedback on the web: opens claude.ai's own comment composer on the current page,
 * so testers' notes land in the artifact's comments. Hidden where the viewer can't comment.
 */
export function useFeedback() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!isWeb) return;
    let alive = true;
    claudeUse('comments').then((c) => alive && setAvailable(!!c));
    return () => {
      alive = false;
    };
  }, []);
  return {
    available,
    open: async (el: Element | null) => {
      if (!el) return;
      const opened = await openFeedback(el);
      if (!opened) toast('Apri i commenti di claude.ai per lasciare un feedback');
    },
  };
}
