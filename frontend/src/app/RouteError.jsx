import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorState } from '../components/common/ErrorState.jsx';

export default function RouteError() {
  const err = useRouteError();
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <ErrorState title={notFound ? "That page doesn't exist" : 'Something went wrong'} message="Reload to try again." onRetry={() => window.location.reload()} />
    </div>
  );
}
