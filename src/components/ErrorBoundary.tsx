import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Ignore ResizeObserver loop limit exceeded error
    const resizeObserverError = "ResizeObserver loop completed with undelivered notifications.";
    if (error.message === resizeObserverError || error.message.includes(resizeObserverError)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = this.state.error?.toString() || "An unexpected error occurred.";
      let isFirestoreError = false;
      let firestoreErrorData = null;

      try {
        // Check if the error message is a JSON string from handleFirestoreError
        const jsonMatch = errorMessage.match(/Error: (\{.*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1] : errorMessage;
        firestoreErrorData = JSON.parse(jsonStr);
        if (firestoreErrorData && firestoreErrorData.error) {
          isFirestoreError = true;
          errorMessage = firestoreErrorData.error;
        }
      } catch (e) {
        // Not a JSON error, keep original message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full premium-card p-8 text-center space-y-6">
            <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight">
                {isFirestoreError ? "Database Permission Error" : "Something went wrong"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isFirestoreError 
                  ? "You don't have permission to perform this action. Please check your account roles."
                  : "An unexpected error occurred. We've been notified and are looking into it."}
              </p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-xl text-left overflow-auto max-h-48">
              <p className="text-[10px] font-mono text-destructive break-all">
                {errorMessage}
              </p>
              {isFirestoreError && firestoreErrorData && (
                <div className="mt-2 pt-2 border-t border-destructive/10 text-[9px] font-mono text-muted-foreground">
                  <p>Operation: {firestoreErrorData.operationType}</p>
                  <p>Path: {firestoreErrorData.path}</p>
                </div>
              )}
            </div>
            <Button 
              onClick={this.handleReset}
              className="w-full rounded-xl gradient-primary"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
