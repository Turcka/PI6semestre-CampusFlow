import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@campusflow/shared';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export function parsePagination(input: PaginationInput = {}) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(input.pageSize) || DEFAULT_PAGE_SIZE));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

export function paginatedResponse<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, page, pageSize, total };
}
