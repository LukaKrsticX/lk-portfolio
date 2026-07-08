"use client";
import { Component, type ReactNode } from "react";

/** GL failures render null — the server-rendered DOM underneath IS the fallback. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
