import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Findable-within-1s is too tight when several lanes load the machine.
configure({ asyncUtilTimeout: 5000 });
