import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

const NotFound: React.FC = () => {
  const error = useRouteError()

  const errorMsg = () => {
    if (isRouteErrorResponse(error)) {
      // error is type `ErrorResponse`
      return error.error?.message || error.statusText
    }
    else if (error instanceof Error) {
      return error.message
    }
    else if (typeof error === 'string') {
      return error
    }
    else {
      console.error(error)
      return 'Unknown error'
    }
  }

  return (
    <div>
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <p>
        <i>{errorMsg()}</i>
      </p>
    </div>
  )
}

export default NotFound
