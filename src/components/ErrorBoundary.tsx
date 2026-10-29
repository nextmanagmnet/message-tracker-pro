import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-semibold text-foreground">{i18n.t("errors.somethingWrong")}</h1>
            <p className="text-muted-foreground">{i18n.t("errors.reload")}</p>
            <Button onClick={() => window.location.reload()}>{i18n.t("errors.reloadButton")}</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
