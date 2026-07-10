import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StarRating, StarRatingDisplay } from './StarRating';

describe('StarRating (interactivo)', () => {
  it('renderiza 5 radios con nombre accesible "N de 5 estrellas"', () => {
    render(<StarRating name="overall" value={null} onChange={() => {}} legend="Puntaje" />);
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByRole('radio', { name: `${n} de 5 estrellas` })).toBeInTheDocument();
    }
  });

  it('seleccionar una estrella emite su valor', async () => {
    const onChange = vi.fn();
    render(<StarRating name="overall" value={null} onChange={onChange} legend="Puntaje" />);

    await userEvent.click(screen.getByRole('radio', { name: '4 de 5 estrellas' }));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('en modo clearable, "Sin puntuar" emite null y NO 0', async () => {
    const onChange = vi.fn();
    render(<StarRating name="taste" value={3} onChange={onChange} clearable legend="Gusto" />);

    await userEvent.click(screen.getByRole('radio', { name: 'Sin puntuar' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onChange).not.toHaveBeenCalledWith(0);
  });

  it('sin clearable no existe la opción "Sin puntuar" (el global es obligatorio)', () => {
    render(<StarRating name="overall" value={null} onChange={() => {}} legend="Puntaje" />);
    expect(screen.queryByRole('radio', { name: 'Sin puntuar' })).not.toBeInTheDocument();
  });
});

describe('StarRatingDisplay (solo lectura)', () => {
  it('no expone radios ni foco: es una imagen con etiqueta', () => {
    render(<StarRatingDisplay value={4.3} />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4.3 de 5 estrellas' })).toBeInTheDocument();
  });
});
