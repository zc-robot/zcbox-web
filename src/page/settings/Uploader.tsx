import { DropzoneComponent } from 'react-dropzone-component'
import '~/react-dropzone-component/styles/filepicker.css'
import '~/dropzone/dist/dropzone.css'

const Uploader: React.FC = () => {
  const componentConfig = {
    iconFiletypes: ['.zip'],
    showFiletypeIcon: true,
    postUrl: '/api/uploadFirmware',
  }
  const djsConfig = {
    paramName: 'file',
    chunking: true,
    acceptedFiles: '.zip',
    maxFilesize: 1024, // megabytes
    chunkSize: 1000000, // bytes
    addRemoveLinks: true,
  }

  return (
    // TODO: Implement DropzoneComponent
    <div className="w-100 flex-self-center">
      <DropzoneComponent
        config={componentConfig}
        djsConfig={djsConfig} />
    </div>
  )
}

export default Uploader
