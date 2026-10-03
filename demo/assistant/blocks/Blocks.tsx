// Renders an answer's blocks in order. Each renderer is exported too, so pages can show the same tables, charts and statuses.

import type { Block } from '../protocol';
import { Chart } from './Chart';
import { Draft } from './Draft';
import { LinkCard } from './LinkCard';
import { Stat } from './Stat';
import { Status } from './Status';
import { Table } from './Table';

export { Chart, Draft, LinkCard, Stat, Status, Table };
export { StatusBadge, STATUS_LABEL } from './Status';

function One({ block }: { block: Block }) {
  switch (block.kind) {
    case 'table':
      return <Table columns={block.columns} rows={block.rows} caption={block.caption} />;
    case 'chart':
      return <Chart type={block.type} series={block.series} x={block.x} unit={block.unit} caption={block.caption} />;
    case 'stat':
      return <Stat items={block.items} />;
    case 'status':
      return <Status title={block.title} status={block.status} reasons={block.reasons} sources={block.sources} href={block.href} />;
    case 'draft':
      return <Draft channel={block.channel} to={block.to} subject={block.subject} body={block.body} />;
    case 'link':
      return <LinkCard label={block.label} href={block.href} />;
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  if (!blocks.length) return null;
  return (
    <div className="as-blocks">
      {blocks.map((b, i) => (
        <One key={i} block={b} />
      ))}
    </div>
  );
}
