export interface TemplateItem {
  label: string;
  value: string;
  description?: string;
}

export const statCardsTemplate = (items: TemplateItem[]): string => {
  const cards = items.map(item => `
    <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center; background: #f9fafb;">
      <div style="font-size: 28px; font-weight: 800; color: #0066cc; margin-bottom: 4px;">${item.value}</div>
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 2px;">${item.label}</div>
      ${item.description ? `<div style="font-size: 13px; color: #6b7280;">${item.description}</div>` : ''}
    </div>
  `).join('');

  return `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 24px 0;">${cards}</div>`;
};

export const comparisonGridTemplate = (items: TemplateItem[]): string => {
  const boxes = items.map(item => `
    <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
      <div style="font-size: 16px; font-weight: 700; color: #0066cc; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">${item.label}</div>
      <div style="font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 6px;">${item.value}</div>
      ${item.description ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.5;">${item.description}</div>` : ''}
    </div>
  `).join('');

  return `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 24px 0;">${boxes}</div>`;
};

export const timelineTemplate = (items: TemplateItem[]): string => {
  const steps = items.map((item, i) => `
    <div style="display: flex; gap: 16px; margin-bottom: ${i < items.length - 1 ? '24px' : '0'};">
      <div style="flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: #0066cc; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;">${i + 1}</div>
      <div style="flex: 1; padding-top: 4px;">
        <div style="font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px;">${item.label}</div>
        <div style="font-size: 14px; color: #6b7280; line-height: 1.5;">${item.value}</div>
        ${item.description ? `<div style="font-size: 13px; color: #9ca3af; margin-top: 4px;">${item.description}</div>` : ''}
      </div>
    </div>
  `).join('');

  return `<div style="margin: 24px 0; padding: 24px; border-left: 3px solid #0066cc; background: #f9fafb; border-radius: 0 10px 10px 0;">${steps}</div>`;
};

export const processFlowTemplate = (items: TemplateItem[]): string => {
  const steps = items.map((item, i) => {
    const arrow = i < items.length - 1 ? `<div style="display: flex; align-items: center; justify-content: center; font-size: 20px; color: #0066cc; font-weight: bold;">→</div>` : '';
    return `
      <div style="flex: 1; text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: #0066cc; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; margin: 0 auto 8px;">${i + 1}</div>
        <div style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 4px;">${item.label}</div>
        <div style="font-size: 12px; color: #6b7280;">${item.value}</div>
      </div>
      ${arrow}
    `;
  }).join('');

  return `<div style="display: flex; align-items: center; gap: 8px; margin: 24px 0; overflow-x: auto;">${steps}</div>`;
};

export const templateTypes = [
  { key: 'stats', label: 'Stat Cards', description: 'Grid of metrics with bold numbers', defaultItems: 4 },
  { key: 'comparison', label: 'Comparison Grid', description: 'Side-by-side comparison boxes', defaultItems: 2 },
  { key: 'timeline', label: 'Timeline', description: 'Vertical timeline with numbered steps', defaultItems: 4 },
  { key: 'process', label: 'Process Flow', description: 'Horizontal process with arrows', defaultItems: 4 },
] as const;

export type TemplateType = typeof templateTypes[number]['key'];

export const generateTemplate = (type: TemplateType, items: TemplateItem[]): string => {
  switch (type) {
    case 'stats': return statCardsTemplate(items);
    case 'comparison': return comparisonGridTemplate(items);
    case 'timeline': return timelineTemplate(items);
    case 'process': return processFlowTemplate(items);
    default: return statCardsTemplate(items);
  }
};
