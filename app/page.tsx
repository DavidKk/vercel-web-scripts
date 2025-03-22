import Meta, { generate } from '@/components/Meta'

const { generateMetadata, metaProps } = generate({
  title: 'Web Scripts Manager',
  description: 'A powerful web script management platform that supports script creation, editing, preview, and deployment',
})

export { generateMetadata }

export default function Home() {
  return (
    <div className="flex flex-col items-center p-10 pt-20 max-w-4xl mx-auto text-center">
      <Meta {...metaProps} />
      <div className="mt-10 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">Script Management</h2>
            <p className="text-gray-600">Easily create, edit, and manage your web scripts with support for multiple script types</p>
          </div>
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">Real-time Preview</h2>
            <p className="text-gray-600">Powerful preview functionality to instantly see your scripts in action</p>
          </div>
        </div>
      </div>
    </div>
  )
}
