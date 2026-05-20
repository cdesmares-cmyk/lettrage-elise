import { ModalBase } from './ModalBase'
import { SectionIntegrationAxonaut } from './SectionIntegrationAxonaut'

export function ModalApiAxonaut({ onClose }: { onClose: () => void }) {
  return (
    <ModalBase titre="Intégration Axonaut" onClose={onClose} largeur="max-w-xl">
      <div className="px-2 py-2">
        {/* SectionIntegrationAxonaut renders its own card — display inline here */}
        <SectionIntegrationAxonaut />
      </div>
    </ModalBase>
  )
}
