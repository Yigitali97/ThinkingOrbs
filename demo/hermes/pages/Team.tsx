// The Team page: hours logged this week against capacity so far, for the delivery teams (Ruling R1).
// Leadership sees everyone, a Manager their own team plus other teams' totals, a Developer themself plus their team's total.

import { usePageContext } from '../../assistant/usePageContext';
import { Table } from '../../assistant/blocks/Blocks';
import type { Column, Row, User } from '../../assistant/protocol';
import type { TimeReport } from '../agent/tools';
import { loadState, proRatedCapacity, weekStart } from '../data/derive';
import type { LoadState } from '../data/derive';
import type { Person } from '../data/types';
import { Loading, listOf, read, round1, sum, usePageData } from './shared';

const LOAD_LABEL: Record<LoadState, string> = { over: 'Over', under: 'Under', ok: 'OK' };

interface TeamData {
  columns: Column[];
  rows: Row[];
  teams: string[];
  restricted?: string;
  failed: boolean;
}

async function loadTeam(user: User, now: Date): Promise<TeamData> {
  const people = await read<Person[]>(user, 'directory.people');
  const time = await read<TimeReport>(user, 'clockify.timeEntries', { from: weekStart(now).getTime(), to: now.getTime() });
  if (!people || !time) return { columns: [], rows: [], teams: [], failed: true };

  // the delivery teams, in directory order; Leadership logs no project hours
  const delivery = people.data.filter((p) => p.team !== 'Leadership');
  const teams = [...new Set(delivery.map((p) => p.team as string))];
  const capacity = (members: Person[]) => sum(members.map((p) => proRatedCapacity(p, now)));
  const row = (name: string, team: string, role: string, hours: number, cap: number): Row => ({
    name,
    team,
    role,
    hours: round1(hours),
    capacity: round1(cap),
    load: LOAD_LABEL[loadState(hours, cap)],
  });

  // individuals the role may see by name; hours for anyone else only ever arrive as a team total
  const named = (p: Person) => user.role === 'leadership' || (user.role === 'manager' ? p.team === user.team : p.id === user.id);
  const rows: Row[] = delivery.filter(named).map((p) => {
    const hours = sum(time.data.entries.filter((e) => e.personId === p.id).map((e) => e.hours));
    return row(p.name, p.team, p.title, hours, capacity([p]));
  });
  const totalled = user.role === 'leadership' ? [] : user.role === 'manager' ? teams.filter((t) => t !== user.team) : [user.team];
  for (const team of totalled) {
    const members = delivery.filter((p) => p.team === team);
    const hours = time.data.teamTotals.find((t) => t.team === team)?.hours ?? 0;
    rows.push(row(`${team} team total`, team, `${members.length} people`, hours, capacity(members)));
  }

  const shownTeams = [...new Set(rows.map((r) => String(r.team)))];
  const columns: Column[] = [
    { key: 'name', label: 'Name' },
    ...(shownTeams.length > 1 ? [{ key: 'team', label: 'Team' }] : []),
    { key: 'role', label: 'Role' },
    { key: 'hours', label: 'Hours this week', align: 'right' as const },
    { key: 'capacity', label: 'Capacity so far', align: 'right' as const },
    { key: 'load', label: 'Load' },
  ];
  return { columns, rows, teams: shownTeams, restricted: time.restricted, failed: false };
}

export function Team() {
  usePageContext({ page: 'team', title: 'Team' });
  const data = usePageData(loadTeam);

  return (
    <div className="page as">
      <h1>Team</h1>
      <p className="lede">
        Hours logged since Monday against each person’s capacity so far: their weekly hours, pro-rated to the working time gone.
        Over is more than 110% of it, under is less than 70%.
      </p>
      <div className="page-section" aria-busy={!data}>
        {!data ? (
          <Loading size="table" />
        ) : data.failed ? (
          <p className="note">The directory or Clockify didn’t respond, so hours can’t be shown right now.</p>
        ) : (
          <>
            {data.restricted && <p className="note">{data.restricted}</p>}
            <div className="page-table">
              <Table columns={data.columns} rows={data.rows} caption={`Hours this week, ${listOf(data.teams)}`} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
