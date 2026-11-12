import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

afterEach(cleanup);

// Bits UI scrolls the active radio into view while moving focus with arrow keys.
Element.prototype.scrollIntoView ??= () => {};
