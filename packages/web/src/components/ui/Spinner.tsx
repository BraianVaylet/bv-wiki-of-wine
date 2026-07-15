import { Spinner as MedanoSpinner, type SpinnerProps } from '@medano-ui/react';

const SM_MAX_PX = 16;
const MD_MAX_PX = 22;

function sizeToken(px: number): NonNullable<SpinnerProps['size']> {
  if (px <= SM_MAX_PX) return 'sm';
  if (px <= MD_MAX_PX) return 'md';
  return 'lg';
}

const DEFAULT_SIZE = 20;

/** Adapter sobre medano-ui: la firma legacy usa tamaño en px. */
export function Spinner({ size = DEFAULT_SIZE }: { size?: number }) {
  return <MedanoSpinner size={sizeToken(size)} />;
}
