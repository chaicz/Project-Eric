import React from 'react';

/**
 * Top-level ErrorBoundary so any render-time exception becomes a visible
 * error panel instead of an empty white screen. Without this, a single
 * broken child can take the whole app down silently in dev.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    // Surface to the dev console for the React DevTools + browser console.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: '24px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)',
          color: '#7f1d1d',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            background: '#fff',
            border: '1px solid #fecaca',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 60px -20px rgba(220,38,38,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg,#ef4444,#f97316)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              !
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, color: '#7f1d1d' }}>
                Something went wrong
              </h1>
              <p style={{ margin: 0, color: '#9f1239', fontSize: 13 }}>
                The app crashed during render. The error is shown below.
              </p>
            </div>
          </div>

          <pre
            style={{
              background: '#0f172a',
              color: '#fecaca',
              padding: 16,
              borderRadius: 10,
              overflow: 'auto',
              fontSize: 12.5,
              lineHeight: 1.5,
              maxHeight: 320,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(error?.stack || error?.message || error)}
          </pre>

          {info?.componentStack && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', color: '#7f1d1d', fontSize: 13 }}>
                Component stack
              </summary>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#cbd5e1',
                  padding: 12,
                  borderRadius: 8,
                  marginTop: 8,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {info.componentStack}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={this.reset}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#fff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
