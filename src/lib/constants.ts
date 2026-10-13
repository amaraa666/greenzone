export const CATEGORIES = [
  "Гэрэл",
  "Хаалга",
  "Цахилгаан",
  "Сандал ширээ",
  "Ариун цэвэр",
  "Цэвэрлэгээтэй холбоотой",
  "Лифт",
  "Бусад",
] as const;

export type Category = (typeof CATEGORIES)[number];
