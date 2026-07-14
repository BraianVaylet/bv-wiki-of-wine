import { EmptyState as MedanoEmptyState } from '@medano-ui/react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  illustration?: ReactNode;
  action?: ReactNode;
}

/** Adapter sobre medano-ui: la firma legacy llama `illustration` al icon. */
export function EmptyState({ title, description, illustration, action }: EmptyStateProps) {
  return (
    <MedanoEmptyState title={title} description={description} icon={illustration} action={action} />
  );
}
