import dayjs, { Dayjs } from "dayjs";

type DateLike = string | number | Date | Dayjs | null | undefined;

const toDayjs = (value: DateLike) => {
  if (value == null || value === "") return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
};

export const formatDate = (value: DateLike, fallback = "N/A") => {
  const parsed = toDayjs(value);
  return parsed ? parsed.format("DD/MM/YYYY") : fallback;
};

export const formatDateTime = (value: DateLike, fallback = "N/A") => {
  const parsed = toDayjs(value);
  return parsed ? parsed.format("DD/MM/YYYY HH:mm") : fallback;
};

export const formatDateWithWeekday = (value: DateLike, fallback = "N/A") => {
  const parsed = toDayjs(value);
  return parsed ? parsed.format("ddd DD/MM/YYYY") : fallback;
};

export const formatMonthYear = (value: DateLike, fallback = "N/A") => {
  const parsed = toDayjs(value);
  return parsed ? parsed.format("MM/YYYY") : fallback;
};

export const formatTime = (value: DateLike, fallback = "N/A") => {
  const parsed = toDayjs(value);
  return parsed ? parsed.format("HH:mm") : fallback;
};
