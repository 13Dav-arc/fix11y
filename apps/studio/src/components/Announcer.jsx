'use client';

import React from 'react';

/**
 * Screen-reader live status announcer for asynchronous audit updates.
 */
export function Announcer({ message }) {
  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </output>
  );
}
