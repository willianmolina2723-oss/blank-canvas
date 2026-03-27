import jsPDF from 'jspdf';
import type { AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';
import { fetchBadgeTemplateUrl } from '@/utils/logoStorage';

interface BadgeData {
  fullName: string;
  roles: AppRole[];
  professionalId: string | null;
  avatarUrl: string | null;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    throw new Error('Failed to fetch image');
  }
};

// Shared rendering logic used by both PDF generation and preview
export async function renderBadgeToCanvas(
  canvas: HTMLCanvasElement,
  data: BadgeData
): Promise<void> {
  const CARD_W = 1024;
  const CARD_H = 640;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Load template background (custom or default)
  try {
    const customTemplateUrl = await fetchBadgeTemplateUrl();
    const templateSrc = customTemplateUrl || '/images/cracha-bg.png';
    const template = await loadImage(customTemplateUrl ? await fetchImageAsDataUrl(templateSrc) : templateSrc);
    ctx.drawImage(template, 0, 0, CARD_W, CARD_H);
  } catch {
    // Try default as fallback
    try {
      const template = await loadImage('/images/cracha-bg.png');
      ctx.drawImage(template, 0, 0, CARD_W, CARD_H);
    } catch {
      console.error('Failed to load badge template');
    }
  }

  // Photo area - left side, large
  const photoW = 300;
  const photoH = 380;
  const photoX = 30;
  const photoY = 180;

  if (data.avatarUrl) {
    try {
      const dataUrl = await fetchImageAsDataUrl(data.avatarUrl);
      const avatar = await loadImage(dataUrl);

      // Red border
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8);

      // Crop photo proportionally
      const imgRatio = avatar.width / avatar.height;
      const areaRatio = photoW / photoH;
      let sx = 0, sy = 0, sw = avatar.width, sh = avatar.height;
      if (imgRatio > areaRatio) {
        sw = avatar.height * areaRatio;
        sx = (avatar.width - sw) / 2;
      } else {
        sh = avatar.width / areaRatio;
        sy = (avatar.height - sh) / 2;
      }
      ctx.drawImage(avatar, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
    } catch (e) {
      console.error('Failed to load avatar:', e);
      drawPlaceholderPhoto(ctx, photoX, photoY, photoW, photoH);
    }
  } else {
    drawPlaceholderPhoto(ctx, photoX, photoY, photoW, photoH);
  }

  // Text to the right of the photo, bottom-aligned with photo
  const textX = photoX + photoW + 40;
  const maxTextW = CARD_W - textX - 40;
  const photoBottom = photoY + photoH;

  // Pre-calculate text block height to bottom-align
  ctx.font = 'bold 36px Arial, sans-serif';
  const nameLines = wrapText(ctx, data.fullName.toUpperCase(), maxTextW);
  const nameBlockH = nameLines.length * 44;
  const roleH = 34;
  const idH = data.professionalId ? 50 : 0;
  const totalTextH = nameBlockH + roleH + idH;

  // Start text so it ends at photoBottom
  let curY = photoBottom - totalTextH + 30;

  // Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.textAlign = 'left';
  nameLines.forEach((line) => {
    ctx.fillText(line, textX, curY);
    curY += 44;
  });

  // Role
  const roleText = data.roles.length > 0
    ? data.roles.map(r => ROLE_LABELS[r]).join(' / ')
    : 'Colaborador';
  ctx.font = '24px Arial, sans-serif';
  ctx.fillStyle = '#D1E0F0';
  ctx.fillText(roleText, textX, curY + 10);

  // Professional ID
  if (data.professionalId) {
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(data.professionalId, textX, curY + 50);
  }
}

export async function generateBadgePDF(data: BadgeData): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderBadgeToCanvas(canvas, data);

  const imgData = canvas.toDataURL('image/png', 1.0);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [85.6, 53.98],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 53.98);
  pdf.save(`cracha-${data.fullName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

function drawPlaceholderPhoto(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number
) {
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#E5E7EB';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '60px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📷', x + w / 2, y + h / 2 + 20);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
