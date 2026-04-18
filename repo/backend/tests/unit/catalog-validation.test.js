/**
 * Unit tests for catalog template / metadata validation.
 *
 * Tests the validateMetadata function from the resources repository
 * which validates resource metadata against a template's required_fields
 * and validation_rules.
 */

// ---------------------------------------------------------------------------
// Mocks (minimal - validateMetadata is a pure function)
// ---------------------------------------------------------------------------

vi.mock('../../src/db/connection.js', () => {
  const mockDb = vi.fn();
  mockDb.transaction = vi.fn();
  mockDb.raw = vi.fn();
  mockDb.fn = { now: vi.fn(() => 'NOW()') };
  return { default: mockDb, db: mockDb };
});

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { validateMetadata } = await import('../../src/modules/resources/repository.js');

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATE_WITH_RULES = {
  id: 'tmpl-1',
  resource_type: 'equipment',
  required_fields_json: JSON.stringify(['name', 'serial_number', 'weight_kg']),
  validation_rules_json: JSON.stringify({
    name: { type: 'string', minLength: 2, maxLength: 100 },
    serial_number: { type: 'string', pattern: '^[A-Z]{2}\\d{6}$' },
    weight_kg: { type: 'number', min: 0.1, max: 500 },
    is_fragile: { type: 'boolean' },
  }),
};

const TEMPLATE_WITH_OBJECT_FIELDS = {
  id: 'tmpl-2',
  resource_type: 'venue',
  required_fields_json: JSON.stringify([
    { name: 'capacity' },
    { name: 'location' },
  ]),
  validation_rules_json: JSON.stringify({
    capacity: { type: 'number', min: 1 },
    location: { type: 'string' },
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Catalog metadata validation - validateMetadata()', () => {
  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

  it('passes when all required fields are present', () => {
    const metadata = {
      name: 'Projector XL',
      serial_number: 'AB123456',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when a required field is missing', () => {
    const metadata = {
      name: 'Projector XL',
      // serial_number is missing
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Missing required field: 'serial_number'")
    );
  });

  it('fails when a required field is empty string', () => {
    const metadata = {
      name: '',
      serial_number: 'AB123456',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Missing required field: 'name'")
    );
  });

  it('fails when a required field is null', () => {
    const metadata = {
      name: 'Projector',
      serial_number: null,
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Missing required field: 'serial_number'")
    );
  });

  it('handles required_fields as array of objects with .name property', () => {
    const metadata = { capacity: 200, location: 'Building A' };

    const result = validateMetadata(metadata, TEMPLATE_WITH_OBJECT_FIELDS);

    expect(result.valid).toBe(true);
  });

  it('fails with object-style required fields when field is missing', () => {
    const metadata = { capacity: 200 }; // location missing

    const result = validateMetadata(metadata, TEMPLATE_WITH_OBJECT_FIELDS);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Missing required field: 'location'")
    );
  });

  // -------------------------------------------------------------------------
  // Type validation
  // -------------------------------------------------------------------------

  it('enforces type: number validation', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'AB123456',
      weight_kg: 'not a number', // should be number
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Field 'weight_kg' must be of type 'number'")
    );
  });

  it('enforces type: string validation', () => {
    const metadata = {
      name: 12345, // should be string
      serial_number: 'AB123456',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Field 'name' must be of type 'string'")
    );
  });

  it('enforces type: boolean validation', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'AB123456',
      weight_kg: 5.5,
      is_fragile: 'yes', // should be boolean
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Field 'is_fragile' must be of type 'boolean'")
    );
  });

  // -------------------------------------------------------------------------
  // Pattern validation
  // -------------------------------------------------------------------------

  it('enforces pattern validation (serial_number)', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'invalid-serial', // does not match ^[A-Z]{2}\d{6}$
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("does not match pattern")
    );
  });

  it('passes pattern validation for correctly formatted value', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'XY789012',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Min / Max validation
  // -------------------------------------------------------------------------

  it('enforces min value for numbers', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'AB123456',
      weight_kg: 0.01, // below min of 0.1
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("must be >= 0.1")
    );
  });

  it('enforces max value for numbers', () => {
    const metadata = {
      name: 'Projector',
      serial_number: 'AB123456',
      weight_kg: 600, // above max of 500
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("must be <= 500")
    );
  });

  // -------------------------------------------------------------------------
  // MinLength / MaxLength validation
  // -------------------------------------------------------------------------

  it('enforces minLength for strings', () => {
    const metadata = {
      name: 'X', // below minLength of 2
      serial_number: 'AB123456',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("must be at least 2 characters")
    );
  });

  it('enforces maxLength for strings', () => {
    const metadata = {
      name: 'A'.repeat(101), // above maxLength of 100
      serial_number: 'AB123456',
      weight_kg: 5.5,
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("must be at most 100 characters")
    );
  });

  // -------------------------------------------------------------------------
  // Multiple errors at once
  // -------------------------------------------------------------------------

  it('collects multiple validation errors', () => {
    const metadata = {
      // name missing (required)
      serial_number: 'bad', // wrong pattern
      weight_kg: 999, // above max
    };

    const result = validateMetadata(metadata, TEMPLATE_WITH_RULES);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Edge: template with pre-parsed JSON
  // -------------------------------------------------------------------------

  it('handles template with already-parsed JSON fields', () => {
    const template = {
      id: 'tmpl-3',
      resource_type: 'furniture',
      required_fields_json: ['color'],
      validation_rules_json: {
        color: { type: 'string' },
      },
    };

    const result = validateMetadata({ color: 'red' }, template);

    expect(result.valid).toBe(true);
  });
});
