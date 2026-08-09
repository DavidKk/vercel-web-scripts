import { createTraceId, peekTraceIdFromArgs } from '@shared/trace-id'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import type { Context } from '@/initializer/controller'
import { jsonUnauthorized } from '@/initializer/response'
import { validateCookie } from '@/services/auth/access'
import { getTraceId, runWithTraceId } from '@/services/context'

export interface AuthContext extends Context {
  $$authorized?: boolean
}

export function withAuthHandler<C extends Context>(handle: (req: NextRequest, context: C & AuthContext) => Promise<any>) {
  return async (req: NextRequest, context: C & AuthContext) => {
    if (!(await validateCookie())) {
      return jsonUnauthorized()
    }

    return handle(req, context)
  }
}

interface Action<A extends any[], R> {
  (...args: A): Promise<R>
  $$: (...args: A) => Promise<R>
}

/**
 * Log one structured line for a Server Action entry.
 * @param actionHint Short action label (function name when available)
 */
function logServerActionAccess(actionHint: string): void {
  // eslint-disable-next-line no-console -- structured Server Action access log
  console.info(
    JSON.stringify({
      type: 'vws_action',
      traceId: getTraceId(),
      action: actionHint,
    })
  )
}

/**
 * Wrap a Server Action with cookie auth and TraceId ALS binding.
 * Pass `{ traceId }` on any object argument to reuse a client-generated id.
 * @param request Authenticated action body
 * @returns Callable action with `$$` unauthenticated escape hatch
 */
export function withAuthAction<A extends any[], R>(request: (...args: A) => Promise<R>): Action<A, R> {
  const actionHint = request.name || 'action'
  const action = async (...args: A): Promise<R> => {
    if (!(await validateCookie())) {
      redirect('/login')
    }

    const traceId = peekTraceIdFromArgs(args) ?? createTraceId()
    return runWithTraceId(traceId, async () => {
      logServerActionAccess(actionHint)
      return request(...args)
    })
  }

  action.$$ = async (...args: A): Promise<R> => {
    const traceId = peekTraceIdFromArgs(args) ?? createTraceId()
    return runWithTraceId(traceId, async () => {
      logServerActionAccess(actionHint)
      return request(...args)
    })
  }
  return action
}

/**
 * Trim action handler to return only the action function
 */
export function trimAction<A extends any[], R>(action: Action<A, R>) {
  return action.$$
}
