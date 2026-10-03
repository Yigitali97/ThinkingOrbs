// The AWS intent: six months of cost per service and what drove the latest change (Leadership),
// or the policy's reason plus service health for everyone else.

import type { Block } from '../../../assistant/protocol';
import { hasAny } from '../../../assistant/text';
import type { AwsCost, AwsHealth } from '../../data/types';
import type { Answer } from './shared';
import { capitalize, dayLabel, intent, money, monthLabel, monthName } from './shared';

function healthTable(health: AwsHealth[]): Block {
  return {
    kind: 'table',
    columns: [
      { key: 'service', label: 'Service' },
      { key: 'status', label: 'Status' },
      { key: 'deploy', label: 'Last deploy' },
      { key: 'note', label: 'Note' },
    ],
    rows: health.map((h) => ({ service: h.service, status: capitalize(h.status), deploy: dayLabel(h.lastDeployAt), note: h.note ?? '' })),
    caption: 'AWS service health',
  };
}

async function healthInstead(a: Answer, reason: string, alternative?: string): Promise<void> {
  const health = await a.get<AwsHealth[]>('aws.health', {}, 'service health');
  const lines = [[reason, alternative].filter(Boolean).join(' ')];
  if (!health) return a.send(lines);
  const degraded = health.filter((h) => h.status !== 'healthy').map((h) => h.service);
  lines.push(degraded.length ? `Degraded right now: ${degraded.join(', ')}.` : `All ${health.length} services are healthy.`);
  return a.send(lines, [healthTable(health)]);
}

export const awsCosts = intent<true>(
  'aws-costs',
  (text) => (hasAny(text, ['aws', 'cloud']) && hasAny(text, ['cost', 'costs', 'spend', 'spending', 'bill', 'billing', 'expensive']) ? true : null),
  async (_p, a) => {
    const r = await a.result<AwsCost[]>('aws.costs', { months: 6 }, 'AWS costs');
    if (!r.ok) return r.reason === 'denied' ? healthInstead(a, r.message, r.alternative) : a.send([]);
    const costs = r.data;
    const months = [...new Set(costs.map((c) => c.month))].sort();
    const services = [...new Set(costs.map((c) => c.service))];
    if (months.length < 2) return a.send(["There isn't enough AWS cost history to compare months yet."]);
    const usd = (month: string, service?: string) =>
      costs.filter((c) => c.month === month && (!service || c.service === service)).reduce((s, c) => s + c.usd, 0);

    const [prev, last] = months.slice(-2);
    const total = usd(last);
    const before = usd(prev);
    const change = before > 0 ? Math.round(((total - before) / before) * 100) : null;
    const driver = services
      .map((s) => ({ service: s, now: usd(last, s), before: usd(prev, s) }))
      .sort((x, y) => y.now - y.before - (x.now - x.before))[0];
    const driverChange = driver.before > 0 ? Math.round(((driver.now - driver.before) / driver.before) * 100) : null;

    const lines = [
      `AWS spend was ${money(total)} in ${monthName(last)}, ` +
        (change === null ? `against nothing in ${monthName(prev)}.` : `${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on ${monthName(prev)}.`),
    ];
    if (driver.now > driver.before) {
      lines.push(
        `Most of the change came from ${driver.service}: ${money(driver.now)}, up ${money(driver.now - driver.before)}` +
          (driverChange !== null ? ` (${driverChange}%).` : '.'),
      );
    }
    const health = await a.get<AwsHealth[]>('aws.health', {}, 'the cause from service health');
    const note = health?.find((h) => h.service === driver.service)?.note;
    if (note) lines.push(`AWS health notes for ${driver.service}: ${note}.`);

    return a.send(lines, [
      {
        kind: 'chart',
        type: 'line',
        x: months.map(monthLabel),
        series: services.map((s) => ({ name: s, values: months.map((m) => Math.round(usd(m, s))) })),
        unit: 'USD',
        caption: 'Monthly AWS cost per service',
      },
    ]);
  },
);
