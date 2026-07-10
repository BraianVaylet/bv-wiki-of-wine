import type { MyReview, Review, UpsertReviewInput } from '@bv/shared';
import type { DB } from '../db/connection';
import { notFound } from '../lib/errors';
import { now as defaultNow } from '../lib/time';
import { reviewRepo } from '../repositories/reviewRepo';
import { wineRepo } from '../repositories/wineRepo';
import type { Actor } from '../types';

export function createReviewService(db: DB, now: () => number = defaultNow) {
  /** Un vino borrado (o inexistente) no se puede reseñar (RN-4). */
  function assertReviewable(wineId: number): void {
    const wine = wineRepo.findById(db, wineId);
    if (!wine || wine.deletedAt !== null) throw notFound('Ese vino no existe.');
  }

  return {
    /** Upsert: idempotente, nunca un 409 "ya reseñaste" (CU-5). */
    upsert(wineId: number, input: UpsertReviewInput, actor: Actor): Review {
      assertReviewable(wineId);
      reviewRepo.upsert(
        db,
        {
          wineId,
          userId: actor.id,
          overall: input.overall,
          taste: input.taste,
          aroma: input.aroma,
          body: input.body,
          valueForMoney: input.valueForMoney,
          notes: input.notes,
        },
        now(),
      );
      const review = reviewRepo.findMine(db, wineId, actor.id);
      if (!review) throw notFound('No se pudo guardar la reseña.');
      return review;
    },

    remove(wineId: number, actor: Actor): void {
      const existed = reviewRepo.deleteMine(db, wineId, actor.id);
      if (!existed) throw notFound('No tenías una reseña en ese vino.');
    },

    listMine(actor: Actor, sort: 'recent' | 'rating'): MyReview[] {
      return reviewRepo.listMine(db, actor.id, sort);
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
