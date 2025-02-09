import { plainText } from '@/initializer/controller'
import { setHeaders } from '@/services/context'

export const POST = plainText(async (req) => {
  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) {
    throw new Error('No file provided')
  }

  const content = formData.get('content')
  if (!content) {
    throw new Error('No content provided')
  }

  setHeaders({ 'Content-Type': 'text/html; charset=utf-8' })

  return `
<script>
  window.sessionStorage.setItem('preview#file', ${JSON.stringify(file)});
  const content = \`${JSON.stringify(content)}\`.slice(1, -1);
  window.sessionStorage.setItem('preview#content', content);
  setTimeout(() => window.location.replace('/static/preview'), 500);
</script>
  `
})
