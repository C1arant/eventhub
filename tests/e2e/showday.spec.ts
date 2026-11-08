import { expect, test, type Page } from '@playwright/test';

const OWNER = { name: 'Olivia Owner', email: 'owner@example.test', password: 'owner-password-123' };
const SAM = { name: 'Sam Caller', email: 'sam@example.test', password: 'sam-password-1234' };

function isoDatePlus(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function addPerson(page: Page, name: string, email?: string) {
	await page.goto('/people');
	const form = page.locator('form[action="?/create"]');
	await form.getByLabel('Name', { exact: true }).fill(name);
	if (email) await form.getByLabel('Email (optional)').fill(email);
	await form.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function assign(page: Page, eventUrl: string, name: string) {
	await page.goto(`${eventUrl}/people`);
	const section = page.locator('section', { hasText: 'Assign someone' });
	await section.getByLabel('Person').selectOption({ label: name });
	await section.getByRole('button', { name: 'Assign' }).click();
	await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
}

const card = (page: Page, name: string) => page.locator('li', { has: page.getByRole('heading', { level: 3, name }) });

test('show day: setup, invite, live control, guest view, revoke', async ({ browser }) => {
	// Separate contexts (own cookies) for owner, crew and guest.
	const newPage = async () =>
		(await browser.newContext({ baseURL: 'http://localhost:4173', extraHTTPHeaders: { 'x-forwarded-proto': 'http' } })).newPage();
	const owner = await newPage();
	const crew = await newPage();
	const guest = await newPage();

	// 1. Owner setup
	await owner.goto('/');
	await expect(owner).toHaveURL(/\/setup/);
	await owner.getByLabel('Your name').fill(OWNER.name);
	await owner.getByLabel('Email').fill(OWNER.email);
	await owner.getByLabel('Password').fill(OWNER.password);
	await owner.getByRole('button', { name: 'Create owner account' }).click();
	await expect(owner).not.toHaveURL(/\/setup/);

	// 2. Event from the Gig starter, 7 days out
	await owner.goto('/events/new');
	const tpl = owner.locator('form[action="?/fromTemplate"]');
	await tpl.getByLabel('Template').selectOption({ label: 'Gig starter' });
	await tpl.getByLabel('Name').fill('E2E Gig');
	await tpl.getByLabel('Start date').fill(isoDatePlus(7));
	await tpl.getByRole('button', { name: 'Create from template' }).click();
	await expect(owner).toHaveURL(/\/events\/\d+$/);
	const eventUrl = new URL(owner.url()).pathname;
	await expect(owner.getByRole('heading', { level: 1, name: 'E2E Gig' })).toBeVisible();

	// 3. People: Sam (with email) and Alex (guest)
	await addPerson(owner, SAM.name, SAM.email);
	await addPerson(owner, 'Alex Guest');
	await assign(owner, eventUrl, SAM.name);
	await assign(owner, eventUrl, 'Alex Guest');

	// 4. Crew invite for Sam
	await card(owner, SAM.name).getByRole('button', { name: 'Send crew invite' }).click();
	const inviteUrl = await owner.getByRole('textbox', { name: /^Invite for/ }).inputValue();
	expect(inviteUrl).toContain('/invite/');

	// 5. Sam accepts in a second context
	await crew.goto(inviteUrl);
	await crew.getByLabel('Your name').fill(SAM.name);
	await crew.getByLabel('Choose a password').fill(SAM.password);
	await crew.getByRole('button', { name: 'Create account' }).click();
	await expect(crew).not.toHaveURL(/\/invite\//);

	// 6. Owner marks Sam as show caller
	await owner.goto(`${eventUrl}/people`);
	await expect(card(owner, SAM.name).getByText('Has login')).toBeVisible();
	await card(owner, SAM.name).getByLabel(/Show caller/).check();
	await card(owner, SAM.name).getByRole('button', { name: 'Save' }).click();
	await expect(card(owner, SAM.name).getByRole('status')).toHaveText('Saved.');

	// 7. Guest link for Alex with live access
	const alex = card(owner, 'Alex Guest');
	await alex.getByText('Create guest link').click();
	await alex.getByLabel('Allow live view').check();
	await alex.getByRole('button', { name: 'Create link' }).click();
	const guestUrl = await owner.getByRole('textbox', { name: /^Guest link for Alex Guest/ }).inputValue();
	expect(guestUrl).toContain('/g/');

	// 8. Everyone gets to the live page for the day
	await owner.goto(`${eventUrl}/live`);
	await owner.getByRole('link', { name: /Open live/ }).click();
	await expect(owner).toHaveURL(/\/live\/\d+$/);
	const ownerLiveUrl = owner.url();

	await crew.goto(ownerLiveUrl);
	await crew.getByRole('button', { name: 'Start' }).click();
	await expect(crew.getByRole('heading', { level: 2, name: 'Load in' })).toBeVisible();

	await guest.goto(guestUrl);
	await guest.getByRole('link', { name: /Watch live/ }).click();
	await expect(guest).toHaveURL(/\/g\/.+\/live\/\d+$/);

	await expect(owner.getByRole('heading', { level: 2, name: 'Load in' })).toBeVisible({ timeout: 5000 });
	await expect(guest.getByRole('heading', { level: 2, name: 'Load in' })).toBeVisible({ timeout: 5000 });

	// 9. Sam presses Next; owner and guest see the second item as NOW within 3 s
	await crew.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(owner.getByRole('heading', { level: 2, name: 'Soundcheck' })).toHaveText('Soundcheck', { timeout: 3000 });
	await expect(guest.getByRole('heading', { level: 2, name: 'Soundcheck' })).toHaveText('Soundcheck', { timeout: 3000 });

	// 10. Owner revokes the guest link; guest reload is refused
	await owner.goto(`${eventUrl}/people`);
	owner.once('dialog', (d) => d.accept());
	await card(owner, 'Alex Guest').getByRole('button', { name: 'Revoke' }).click();
	await expect(card(owner, 'Alex Guest').getByText('revoked')).toBeVisible();

	await guest.reload();
	await expect(guest.getByText('This link is no longer valid')).toBeVisible();
});
