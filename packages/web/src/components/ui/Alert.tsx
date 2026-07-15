import { Alert as MedanoAlert } from '@medano-ui/react';
import type { ReactNode } from 'react';

type Variant = 'danger' | 'info';

/**
 * Adapter sobre medano-ui: la firma legacy usa children como título del
 * banner. Los de error se anuncian solos (role="alert" lo pone medano).
 */
export function Alert({
  variant = 'info',
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return <MedanoAlert tone={variant} title={children} />;
}
