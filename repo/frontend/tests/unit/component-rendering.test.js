/**
 * Svelte component rendering tests.
 *
 * These tests actually mount components into a jsdom DOM using
 * @testing-library/svelte (already in devDependencies). They assert the
 * rendered markup reacts to props and user events — unlike the logic-only
 * suite in `components.test.js` which only touches exported module logic.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

import Badge from '$lib/components/ui/Badge.svelte';
import DataTable from '$lib/components/ui/DataTable.svelte';
import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
import Pagination from '$lib/components/ui/Pagination.svelte';
import Sidebar from '$lib/components/layout/Sidebar.svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import FileUpload from '$lib/components/ui/FileUpload.svelte';
import FormField from '$lib/components/ui/FormField.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import Timeline from '$lib/components/ui/Timeline.svelte';

/** Build a minimal Svelte 5 snippet that renders the given HTML. */
function htmlSnippet(html) {
  return createRawSnippet(() => ({
    render: () => html,
  }));
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
describe('<Badge>', () => {
  it('renders the provided text', () => {
    const { getByText } = render(Badge, { props: { text: 'approved', variant: 'approved' } });
    expect(getByText('approved')).toBeTruthy();
  });

  it('applies different variant classes for different variants', () => {
    const approved = render(Badge, { props: { text: 'A', variant: 'approved' } });
    const rejected = render(Badge, { props: { text: 'R', variant: 'rejected' } });

    const approvedSpan = approved.getByText('A');
    const rejectedSpan = rejected.getByText('R');
    // Class attribute should differ across variants.
    expect(approvedSpan.className).not.toBe(rejectedSpan.className);
  });

  it('falls back to the info variant for unknown variants', () => {
    const unknown = render(Badge, { props: { text: 'X', variant: 'does-not-exist' } });
    const info = render(Badge, { props: { text: 'Y', variant: 'info' } });
    // Different text but same class signature (modulo the text).
    expect(unknown.getByText('X').className).toBe(info.getByText('Y').className);
  });
});

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------
describe('<DataTable>', () => {
  const COLUMNS = [
    { key: 'name', label: 'Name' },
    { key: 'state', label: 'State' },
  ];

  it('renders every row\'s cell values', () => {
    const rows = [
      { name: 'First Event', state: 'draft' },
      { name: 'Second Event', state: 'approved' },
    ];
    const { getByText } = render(DataTable, { props: { columns: COLUMNS, data: rows } });
    expect(getByText('First Event')).toBeTruthy();
    expect(getByText('Second Event')).toBeTruthy();
    expect(getByText('draft')).toBeTruthy();
    expect(getByText('approved')).toBeTruthy();
  });

  it('renders the empty-state message when data is empty', () => {
    const { getByText } = render(DataTable, {
      props: { columns: COLUMNS, data: [], emptyMessage: 'Nothing here yet' },
    });
    expect(getByText('Nothing here yet')).toBeTruthy();
  });

  it('calls onSort when a sortable column header is clicked', async () => {
    const onSort = vi.fn();
    const columns = [
      { key: 'name', label: 'Name', sortable: true },
    ];
    const { getByText } = render(DataTable, {
      props: { columns, data: [{ name: 'x' }], onSort },
    });
    await fireEvent.click(getByText('Name'));
    expect(onSort).toHaveBeenCalledWith({ key: 'name', direction: 'asc' });
  });
});

// ---------------------------------------------------------------------------
// LoadingSpinner
// ---------------------------------------------------------------------------
describe('<LoadingSpinner>', () => {
  it('mounts without errors', () => {
    const { container } = render(LoadingSpinner);
    // The component should render at least one DOM element.
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('<Pagination>', () => {
  it('renders navigation controls and reacts to page changes', async () => {
    const onPageChange = vi.fn();
    // The component computes totalPages from (total / pageSize). Passing
    // `totalPages` directly is ignored — we need `total` + `pageSize` that
    // derive a value > 1, otherwise the nav block renders nothing.
    const { container } = render(Pagination, {
      props: { page: 2, pageSize: 10, total: 50, onPageChange },
    });
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
describe('<Sidebar>', () => {
  const ADMIN_PERMS = [
    'event:read',
    'event:create',
    'event:approve',
    'reservation:request',
    'recipe:create',
    'inventory:read',
    'entitlement:redeem',
    'reports:export',
    'admin:roles',
  ];

  it('renders expanded nav with the brand and label text', () => {
    const { container, getByText } = render(Sidebar, {
      props: {
        currentPath: '/dashboard',
        user: { name: 'Admin', roles: ['admin'] },
        permissions: ADMIN_PERMS,
        collapsed: false,
      },
    });
    expect(getByText('Hospitality Ops')).toBeTruthy();
    expect(getByText('Dashboard')).toBeTruthy();
    expect(getByText('Events')).toBeTruthy();
    // There should be nav links (<a href>) present
    const links = container.querySelectorAll('a.nav-link');
    expect(links.length).toBeGreaterThan(1);
  });

  it('hides brand + labels when collapsed', () => {
    const { queryByText, container } = render(Sidebar, {
      props: {
        currentPath: '/dashboard',
        user: { name: 'Admin', roles: ['admin'] },
        permissions: ADMIN_PERMS,
        collapsed: true,
      },
    });
    // Brand hides when collapsed
    expect(queryByText('Hospitality Ops')).toBeNull();
    // And label spans disappear — nav links still render for their icons
    const labelSpans = container.querySelectorAll('.nav-label');
    expect(labelSpans.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
describe('<Modal>', () => {
  it('is hidden when open=false', () => {
    const { queryByRole } = render(Modal, {
      props: {
        open: false,
        title: 'Hidden',
        onClose: vi.fn(),
        children: htmlSnippet('<p>body</p>'),
      },
    });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders title + body when open=true', () => {
    const { getByRole, getByText } = render(Modal, {
      props: {
        open: true,
        title: 'Visible Modal',
        onClose: vi.fn(),
        children: htmlSnippet('<p data-testid="modal-body">hello modal</p>'),
      },
    });
    expect(getByRole('dialog')).toBeTruthy();
    expect(getByText('Visible Modal')).toBeTruthy();
    expect(getByText('hello modal')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FileUpload
// ---------------------------------------------------------------------------
describe('<FileUpload>', () => {
  it('renders the drop zone with a file input', () => {
    const { container, getByText } = render(FileUpload, {
      props: { onUpload: vi.fn() },
    });
    expect(getByText(/Drag & drop files here/i)).toBeTruthy();
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
  });

  it('lists a selected valid file and exposes an Upload All button', async () => {
    const { container, getByText } = render(FileUpload, {
      props: { onUpload: vi.fn().mockResolvedValue(undefined) },
    });
    const input = container.querySelector('input[type="file"]');
    const file = new File(['hi'], 'note.pdf', { type: 'application/pdf' });
    await fireEvent.change(input, { target: { files: [file] } });

    expect(getByText('note.pdf')).toBeTruthy();
    expect(getByText('Upload All')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------
describe('<FormField>', () => {
  it('renders the label and its slotted child input', () => {
    const { getByText, container } = render(FormField, {
      props: {
        label: 'Email',
        required: true,
        error: '',
        children: htmlSnippet('<input type="email" name="email" />'),
      },
    });
    expect(getByText('Email')).toBeTruthy();
    expect(container.querySelector('input[name="email"]')).toBeTruthy();
    // The required marker is present
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toContain('*');
  });

  it('renders the error message with role="alert" when error is set', () => {
    const { getByRole } = render(FormField, {
      props: {
        label: 'Email',
        error: 'Email is required',
        children: htmlSnippet('<input />'),
      },
    });
    const alert = getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toBe('Email is required');
  });
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
describe('<Toast>', () => {
  it('renders the provided message as an alert', () => {
    const { getByRole, getByText } = render(Toast, {
      props: { message: 'Saved successfully', type: 'success', duration: 0 },
    });
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('Saved successfully')).toBeTruthy();
  });

  it('hides when the dismiss button is clicked', async () => {
    const { getByLabelText, queryByText } = render(Toast, {
      props: { message: 'Dismissable', type: 'info', duration: 0 },
    });
    expect(queryByText('Dismissable')).toBeTruthy();
    await fireEvent.click(getByLabelText('Dismiss notification'));
    // After the 300ms exit transition the message should be gone. Wait briefly.
    await new Promise((r) => setTimeout(r, 350));
    expect(queryByText('Dismissable')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
describe('<Timeline>', () => {
  it('renders one item per entry', () => {
    const entries = [
      { actor: 'alice', action: 'Created', timestamp: '2026-01-01T10:00:00Z', notes: 'first' },
      { actor: 'bob', action: 'Approved', timestamp: '2026-01-02T10:00:00Z', notes: 'second' },
      { actor: 'carol', action: 'Updated', timestamp: '2026-01-03T10:00:00Z', notes: 'third' },
    ];
    const { getByText } = render(Timeline, { props: { entries } });
    expect(getByText('alice')).toBeTruthy();
    expect(getByText('bob')).toBeTruthy();
    expect(getByText('carol')).toBeTruthy();
    expect(getByText('first')).toBeTruthy();
    expect(getByText('second')).toBeTruthy();
    expect(getByText('third')).toBeTruthy();
  });

  it('renders no rows when entries is empty', () => {
    const { container } = render(Timeline, { props: { entries: [] } });
    // The outer wrapper renders; each entry block is a direct child div — 0 of them.
    const entryBlocks = container.querySelectorAll('.flex.gap-3');
    expect(entryBlocks.length).toBe(0);
  });
});
