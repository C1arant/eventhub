import { count } from 'drizzle-orm';
import type { DB } from '../db';
import { templates } from '../db/schema';
import { rosItemInput, type RosItemInput } from '../ros';
import { insertTemplate, type TemplateData } from './index';

type Pri = 'low' | 'normal' | 'high';
const item = (title: string, durationMin: number, type: RosItemInput['type'] = 'act', extra: Partial<RosItemInput> = {}): RosItemInput =>
	rosItemInput.parse({ title, durationMin, type, ...extra });
const t = (title: string, dueOffsetDays: number | null, priority: Pri = 'normal', notes = '') => ({ title, priority, notes, dueOffsetDays });

export type Starter = { name: string; type: string; data: TemplateData };

export const STARTERS: Starter[] = [
	{
		name: 'Gig starter',
		type: 'gig',
		data: {
			spanDays: 0,
			days: [{
				label: 'Show', offsetDays: 0, startTime: '16:00',
				items: [
					item('Load in', 60, 'other', { people: 'Crew', notesStage: 'Backline on stage' }),
					item('Soundcheck', 90, 'other', { notesSound: 'Headliner first, support after' }),
					item('Doors', 30, 'other', { hardStart: '19:00' }),
					item('Support act', 40, 'act'),
					item('Changeover', 20, 'changeover'),
					item('Headliner', 75, 'act')
				]
			}],
			sections: [
				{ name: 'Advance', tasks: [
					t('Advance venue', -21, 'high', 'Capacity, curfew, power, parking, load-in route'),
					t('Confirm rider', -14, 'high', 'Tech and hospitality rider agreed with venue'),
					t('Confirm travel and accommodation', -14),
					t('Send set times', -3, 'high', 'To band, support, venue and crew')
				] },
				{ name: 'Show prep', tasks: [
					t('Guest list', -2, 'normal', 'Final list to door staff'),
					t('Print stage plot and input list', -2),
					t('Pack merch and float', -1),
					t('Settle and send invoice', 3, 'low')
				] }
			]
		}
	},
	{
		name: 'Club night starter',
		type: 'club',
		data: {
			spanDays: 0,
			days: [{
				label: 'Night', offsetDays: 0, startTime: '22:00',
				items: [
					item('Doors and warm-up DJ', 60, 'act', { notesSound: 'Low volume until 23:00' }),
					item('Support DJ', 90, 'act'),
					item('Guest DJ', 120, 'act', { notesLighting: 'Full rig, strobes from midnight' }),
					item('Headline DJ', 120, 'act'),
					item('Closing set', 120, 'act'),
					item('Lights up and clear', 30, 'other', { notesStage: 'Staff sweep, lost property' })
				]
			}],
			sections: [
				{ name: 'Promotion', tasks: [
					t('Announce line-up', -28, 'high'),
					t('Post event and ticket link', -21),
					t('Confirm flyers and posters', -14),
					t('Final push on socials', -2)
				] },
				{ name: 'Operations', tasks: [
					t('Confirm DJ tech riders', -10, 'high', 'Decks, mixer, monitors'),
					t('Book security and door staff', -10, 'high'),
					t('Check licence hours and capacity', -7),
					t('Brief bar on stock and guest list', -1),
					t('Pay artists and staff', 2, 'low')
				] }
			]
		}
	},
	{
		name: 'Theatre starter',
		type: 'theatre',
		data: {
			spanDays: 2,
			days: [
				{ label: 'Get-in and tech', offsetDays: 0, startTime: '09:00', items: [
					item('Get-in', 120, 'other', { notesStage: 'Set and props on stage' }),
					item('Focus lighting', 120, 'other', { notesLighting: 'Focus and levels' }),
					item('Sound check', 60, 'other'),
					item('Cue-to-cue', 180, 'other'),
					item('Notes', 30, 'break')
				] },
				{ label: 'Dress rehearsal', offsetDays: 1, startTime: '14:00', items: [
					item('Half-hour call', 30, 'other'),
					item('Act 1', 50, 'act'),
					item('Interval', 20, 'break'),
					item('Act 2', 50, 'act'),
					item('Notes', 30, 'other')
				] },
				{ label: 'Performance', offsetDays: 2, startTime: '18:00', items: [
					item('Half-hour call', 30, 'other'),
					item('House open', 30, 'other', { hardStart: '19:00' }),
					item('Act 1', 50, 'act', { hardStart: '19:30' }),
					item('Interval', 20, 'break'),
					item('Act 2', 50, 'act'),
					item('Curtain call and get-out', 60, 'other')
				] }
			],
			sections: [
				{ name: 'Production', tasks: [
					t('Confirm script and cue sheet', -21, 'high'),
					t('Book rehearsal space', -28),
					t('Order props and costume', -21),
					t('Schedule tech and dress rehearsals', -14, 'high'),
					t('Agree get-in times with venue', -10)
				] },
				{ name: 'Front of house', tasks: [
					t('Print programmes', -7),
					t('Brief front of house and ushers', -1),
					t('Access and licensing checks', -7),
					t('Book interval bar and ticketing', -14)
				] }
			]
		}
	},
	{
		name: 'Corporate event starter',
		type: 'corporate',
		data: {
			spanDays: 0,
			days: [{
				label: 'Event day', offsetDays: 0, startTime: '08:00',
				items: [
					item('Set-up and AV check', 60, 'other', { notesVideo: 'Slides tested on the venue laptop' }),
					item('Registration', 45, 'other'),
					item('Welcome and opening remarks', 15, 'speech', { people: 'Host' }),
					item('Keynote', 45, 'speech'),
					item('Coffee break', 30, 'break'),
					item('Panel', 45, 'speech'),
					item('Lunch', 60, 'break'),
					item('Close and networking', 30, 'speech')
				]
			}],
			sections: [
				{ name: 'Planning', tasks: [
					t('Confirm venue and catering', -42, 'high'),
					t('Confirm speakers and agenda', -28, 'high'),
					t('Send invitations and track RSVPs', -28),
					t('Collect speaker slides', -5, 'high'),
					t('Dietary requirements to caterer', -7)
				] },
				{ name: 'Delivery', tasks: [
					t('Print badges and signage', -3),
					t('Brief staff and AV crew', -1),
					t('Send thank-you and survey', 2, 'low')
				] }
			]
		}
	},
	{
		name: 'Esports event starter',
		type: 'esports',
		data: {
			spanDays: 1,
			days: [
				{ label: 'Group stage', offsetDays: 0, startTime: '11:00', items: [
					item('Player check-in and tech check', 60, 'other'),
					item('Opening ceremony', 15, 'speech'),
					item('Match 1', 45, 'match'),
					item('Match 2', 45, 'match'),
					item('Break', 30, 'break'),
					item('Match 3', 45, 'match')
				] },
				{ label: 'Finals', offsetDays: 1, startTime: '13:00', items: [
					item('Semi-final', 60, 'match'),
					item('Break', 20, 'break'),
					item('Grand final', 90, 'match'),
					item('Trophy presentation', 20, 'speech')
				] }
			],
			sections: [
				{ name: 'Tournament', tasks: [
					t('Open registration and publish rules', -42, 'high'),
					t('Confirm bracket and seeding', -7, 'high'),
					t('Book casters and admins', -21),
					t('Confirm prize pool and payout method', -14)
				] },
				{ name: 'Tech and broadcast', tasks: [
					t('Test lobby servers and game builds', -3, 'high'),
					t('Check PCs, peripherals and network', -2, 'high'),
					t('Overlay and scene check', -1),
					t('Publish VODs and results', 1, 'low')
				] }
			]
		}
	},
	{
		name: 'Charity stream starter',
		type: 'charity_stream',
		data: {
			spanDays: 0,
			days: [{
				label: 'Stream day', offsetDays: 0, startTime: '12:00',
				items: [
					item('Stream start and welcome', 15, 'speech', { notesVideo: 'Intro scene, goal on screen' }),
					item('Game block 1', 120, 'other'),
					item('Donation push', 10, 'donation_push'),
					item('Guest segment', 45, 'act'),
					item('Ad read and sponsor shout-outs', 5, 'ad_read'),
					item('Game block 2', 120, 'other'),
					item('Donation push', 10, 'donation_push'),
					item('Raid and sign-off', 15, 'speech', { notesVideo: 'Raid target confirmed' })
				]
			}],
			sections: [
				{ name: 'Setup', tasks: [
					t('Donation page live', -14, 'high', 'Test a small donation end to end'),
					t('Confirm charity and fundraising goal', -21, 'high'),
					t('Lock guest and sponsor schedule', -7),
					t('Prepare donation incentives and milestones', -7)
				] },
				{ name: 'Stream readiness', tasks: [
					t('Test stream key', -2, 'high'),
					t('Overlay check', -1, 'high', 'Alerts, goal bar, sponsor slides'),
					t('Schedule raid', -1, 'normal', 'Agree a target channel in advance'),
					t('Announce stream times', -7),
					t('Post total raised and thank-yous', 1, 'low')
				] }
			]
		}
	},
	{
		name: 'General event starter',
		type: 'other',
		data: {
			spanDays: 0,
			days: [{
				label: 'Event', offsetDays: 0, startTime: '10:00',
				items: [
					item('Set-up', 90, 'other'),
					item('Doors open', 30, 'other'),
					item('Main programme', 120, 'act'),
					item('Break', 30, 'break'),
					item('Close and pack-down', 60, 'other')
				]
			}],
			sections: [
				{ name: 'Planning', tasks: [
					t('Confirm date and venue', -30, 'high'),
					t('Agree budget', -30),
					t('Confirm programme', -14, 'high'),
					t('Promote the event', -14),
					t('Arrange insurance and permissions', -14)
				] },
				{ name: 'On the day', tasks: [
					t('Book staff and volunteers', -10),
					t('Print signage and run sheets', -2),
					t('Debrief and follow-ups', 2, 'low')
				] }
			]
		}
	}
];

/** Insert the starter templates when (and only when) the templates table is empty. */
export function seedStarters(db: DB): void {
	db.transaction(() => {
		const n = db.select({ n: count() }).from(templates).get()!.n;
		if (n > 0) return;
		for (const s of STARTERS) insertTemplate(db, s.name, s.type, s.data);
	});
}
