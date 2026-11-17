import { isValidCpfChecksum } from '@campusflow/shared';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** CPF com pontuação completa ou parcial: 529.982.247-25, 529982247-25, 529.982.24725. */
const CPF_FORMATTED = /(?<!\d)\d{3}\.\d{3}\.\d{3}-?\d{2}(?!\d)|(?<!\d)\d{9}-\d{2}(?!\d)/g;

/** 11 dígitos corridos: pode ser CPF ou celular com DDD — decidido pelo dígito verificador. */
const ELEVEN_DIGITS = /(?<![\d+])\d{11}(?!\d)/g;

const PHONES = [
  // +55 11 98765-4321, 5511987654321, +55 (11) 3456-7890
  /(?<!\d)\+?55[\s.-]?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g,
  // (11) 98765-4321, (11) 3456-7890
  /\(\d{2}\)\s?9?\d{4}[\s.-]?\d{4}(?!\d)/g,
  // 11 98765-4321, 11-98765-4321
  /(?<!\d)\d{2}[\s.-]9\d{4}[\s.-]?\d{4}(?!\d)/g,
  // 11 3456-7890 (fixo com DDD e separadores)
  /(?<!\d)\d{2}[\s.-]\d{4}[\s.-]\d{4}(?!\d)/g,
  // 98765-4321, 987654321 (celular sem DDD)
  /(?<!\d)9\d{4}[\s.-]?\d{4}(?!\d)/g,
];

/**
 * Mascara dados pessoais no texto do visitante: CPF -> "[cpf]", e-mail -> "[email]",
 * telefone brasileiro -> "[telefone]". Aplicado antes de enviar ao provedor e antes de gravar.
 */
export function maskPii(text: string): string {
  let masked = text.replace(EMAIL, '[email]').replace(CPF_FORMATTED, '[cpf]');

  masked = masked.replace(ELEVEN_DIGITS, (digits) => {
    if (isValidCpfChecksum(digits)) return '[cpf]';
    return digits[2] === '9' ? '[telefone]' : '[cpf]';
  });

  for (const pattern of PHONES) masked = masked.replace(pattern, '[telefone]');
  return masked;
}
